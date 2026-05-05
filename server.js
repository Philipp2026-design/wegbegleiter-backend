// ════════════════════════════════════════════════════════
// WEGBEGLEITER – Node.js Backend
// Philipp Neugebauer · www.philipp-neugebauer.com
// ════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors()); // Alle Origins erlaubt
app.use(express.json());

// ── ANTHROPIC CLIENT ──
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ── SYSTEMPROMPT ──
const SYSTEM_PROMPT = `Du bist der "Wegbegleiter" – ein einfühlsamer digitaler Assistent 
auf der Website von Philipp Neugebauer (www.philipp-neugebauer.com).

DEINE ROLLE:
Du begleitest Menschen, die sich in Trauer, Verlust oder schwierigen 
Lebensphasen befinden. Du hörst zu, gibst Orientierung und verbindest 
sie mit Philipps Angeboten – immer mit Wärme, Würde und Respekt.

DEIN TON:
- Ruhig, warm, niemals hastig
- Du sprichst die Person direkt mit "du" an
- Keine Floskeln wie "Ich verstehe Ihren Schmerz vollkommen"
- Echtes Einfühlen: "Das klingt sehr schwer."
- Kurze Sätze. Raum lassen. Nicht überwältigen.
- Maximal 3-4 Sätze pro Antwort

PHILIPPS ANGEBOTE:
- Trauersprechstunde: 98 € / Stunde, Mo–Fr 18–22 Uhr, online & vor Ort
- Kostenloses Erstgespräch: 30 Minuten, unverbindlich
- Mediale Trauerrede: Philipp schreibt die Rede mit dem Verstorbenen
- Jenseitskontakte: Verbindung zu Verstorbenen in Liebe & Klarheit
- Traumabewältigung: Individuelle Begleitung
- Seminare: Mediales Schreiben, Paranormale Phänomene, Zeichen erkennen
- 2-Tages Workshop: Hamburg & Salzburg
- Online via Zoom oder Microsoft Teams möglich

KONTAKT:
- Web: www.philipp-neugebauer.com
- E-Mail: kontakt@philipp-neugebauer.com
- Tel: 0176 32027096

WICHTIGE GRENZEN:
1. Du ersetzt KEINE Therapie und stellst KEINE Diagnosen
2. Du gibst KEINE medizinischen Ratschläge
3. Du machst keine Garantien über spirituelle Erfahrungen
4. Bei Anzeichen von Krise IMMER auf Telefonseelsorge verweisen:
   0800 111 0 111 (kostenlos, 24h, anonym)

GESPRÄCHSFÜHRUNG:
- Maximal 3–4 Sätze pro Antwort
- Eine Frage am Ende wenn sinnvoll
- Nie mehrere Fragen auf einmal
- Angebote nur nennen wenn es sich natürlich ergibt`;

// ── KRISENWORTE (Sicherheitsnetz serverseitig) ──
const CRISIS_KEYWORDS = [
  'nicht mehr leben', 'keinen sinn mehr', 'aufgeben',
  'sterben wollen', 'ende machen', 'suizid', 'selbstmord',
  'umbringen', 'nicht mehr da sein', 'alles beenden',
  'niemand braucht mich', 'nicht mehr aushalte'
];

function detectCrisis(messages) {
  const lastUserMsg = messages
    .filter(m => m.role === 'user')
    .pop();
  if (!lastUserMsg) return false;
  const lower = lastUserMsg.content.toLowerCase();
  return CRISIS_KEYWORDS.some(k => lower.includes(k));
}

const CRISIS_RESPONSE = `Was du gerade fühlst, ist real und schwer. Du bist nicht allein.

Bitte ruf jetzt die Telefonseelsorge an:
📞 0800 111 0 111 – kostenlos, rund um die Uhr, anonym.

Philipp ist auch persönlich für dich da:
💙 0176 32027096

Du musst das nicht alleine tragen.`;

// ── RATE LIMITING (einfach) ──
const rateLimits = new Map();
const RATE_LIMIT = 20; // Nachrichten pro Stunde pro IP
const RATE_WINDOW = 60 * 60 * 1000; // 1 Stunde

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip) || { count: 0, start: now };
  
  if (now - entry.start > RATE_WINDOW) {
    rateLimits.set(ip, { count: 1, start: now });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT) return false;
  
  entry.count++;
  rateLimits.set(ip, entry);
  return true;
}

// ── VALIDIERUNG ──
function validateMessages(messages) {
  if (!Array.isArray(messages)) return false;
  if (messages.length > 20) return false; // Max 20 Nachrichten
  return messages.every(m =>
    m.role && ['user', 'assistant'].includes(m.role) &&
    typeof m.content === 'string' &&
    m.content.length <= 2000 // Max 2000 Zeichen pro Nachricht
  );
}

// ── CHAT ENDPOINT ──
app.post('/chat', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Rate Limit prüfen
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Zu viele Anfragen. Bitte warte kurz.',
      reply: 'Im Moment kann ich nicht antworten. Schreib Philipp direkt: kontakt@philipp-neugebauer.com'
    });
  }

  const { messages } = req.body;

  // Validierung
  if (!validateMessages(messages)) {
    return res.status(400).json({ error: 'Ungültige Anfrage' });
  }

  // Krisencheck (serverseitig als zweite Sicherheitsstufe)
  if (detectCrisis(messages)) {
    return res.json({ reply: CRISIS_RESPONSE });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300, // Kurze Antworten für den Chat
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const reply = response.content[0]?.text || 
      'Entschuldige, ich konnte keine Antwort formulieren.';

    res.json({ reply });

  } catch (error) {
    console.error('Claude API Fehler:', error.message);
    res.status(500).json({
      error: 'API-Fehler',
      reply: 'Im Moment bin ich nicht erreichbar. Philipp hilft dir direkt weiter:\n📞 0176 32027096\n✉️ kontakt@philipp-neugebauer.com'
    });
  }
});

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Wegbegleiter' });
});

// ── SERVER STARTEN ──
app.listen(PORT, () => {
  console.log(`✅ Wegbegleiter läuft auf Port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}/chat`);
});
