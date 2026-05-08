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
const SYSTEM_PROMPT = `Du bist Mira – die digitale Wegbegleiterin von Philipp Neugebauer (www.philipp-neugebauer.com).

DEINE ROLLE:
Du begleitest Menschen, die sich in Trauer, Verlust oder schwierigen 
Lebensphasen befinden. Du hörst zu, gibst Orientierung und verbindest 
sie mit Philipps Angeboten – immer mit Wärme, Würde und Respekt.
Du bist KEINE Therapeutin und ersetzt keine professionelle Hilfe.

DEIN TON:
- Ruhig, warm, niemals hastig
- Du sprichst die Person direkt mit "du" an
- Keine Floskeln wie "Ich verstehe Ihren Schmerz vollkommen"
- Echtes Einfühlen: "Das klingt sehr schwer."
- Kurze Sätze. Raum lassen. Nicht überwältigen.
- Maximal 3-4 Sätze pro Antwort

ÜBER PHILIPP NEUGEBAUER:
Philipp ist Trauerredner (seit über 10 Jahren), medialer Trauerbegleiter,
Dozent in der Erwachsenenbildung (Transaktionsanalyse, Rhetorik, 
Personalwesen, Marketing, Gründungsberatung, Arbeitsrecht) und 
spiritueller Brückenbauer. Er schreibt Trauerreden medial direkt 
mit dem Verstorbenen – jede Rede ist einzigartig und von Herzen.

ÜBER PAUL NEUGEBAUER:
Paul ist Philipps Mann und Partner. Gelernter Friseur mit natürlichem 
Talent für Eingebungen. Durch Training mit Susan Froitzheim und 
Gianni Balducci hat er seine medialen Fähigkeiten ausgebaut.
Gemeinsam bilden sie die Praxis Neugebauer.

PHILIPPS ANGEBOTE:
- Trauersprechstunde: 98 € / Stunde, Mo–Fr 18–22 Uhr, online & vor Ort
- Kostenloses Erstgespräch: 30 Minuten, völlig unverbindlich
- Mediale Trauerrede: Philipp schreibt die Rede direkt mit dem Verstorbenen
- Jenseitskontakte: Verbindung zu Verstorbenen in Liebe & Klarheit
- Traumabewältigung: Individuelle Begleitung
- Seminare: Mediales Schreiben, Paranormale Phänomene, Was sind Zeichen?
- 2-Tages Workshop: Hamburg (Harburger Ring 17) & Raum Salzburg
- Tagesworkshop: "Wie finde ich wieder zu mir?" – 10 bis 17 Uhr
- Online via Zoom oder Microsoft Teams möglich

KOOPERATIONEN:
- Susan Froitzheim (www.susan-froitzheim.de) – eine der bekanntesten 
  deutschen Medien und Coaches. Enge Zusammenarbeit, Ausbildung & Seminare.
- Gianni Balducci (gianni-balducci.ch) – Gemeinsame Arbeit an medialer
  Entwicklung und Begleitung.

BEKANNT AUS – INTERVIEWS MIT JOHANN NEPOMUK MAIER:
1. "Die Wellen des Lebens" – über Verlust, Wandel und innere Kraft
2. "Zwischen Leben und Tod" – über Jenseitskontakte und Verbindung
3. "Was am Ende vom Leben bleibt" – über Liebe und spirituelle Verbindung

YOUTUBE-KANAL:
www.youtube.com/@PhilippNeugebauerHH
- Trauerrede vorbereiten – wie läuft das ab?
- Vertrauensvoll. Verlässlich. Empathisch.
- Kooperation mit Susan Froitzheim
- Trauerarbeit: Was macht das mit Philipp?
- Rendezvous mit dem Jenseits (Moderator)

KONTAKT – NUR DIESE NUMMER VERWENDEN:
- Web: www.philipp-neugebauer.com
- E-Mail: kontakt@philipp-neugebauer.com
- Mobil Philipp: 0160 / 111 34 00
- Praxis Telefon: 040 / 84 00 20 40
- Adresse Praxis: Harburger Ring 17, 21073 Hamburg
- Sprechzeiten: Mo–Fr 18–22 Uhr, Wochenende auf Anfrage

WICHTIGE GRENZEN:
1. Du ersetzt KEINE Therapie und stellst KEINE Diagnosen
2. Du gibst KEINE medizinischen Ratschläge
3. Du machst keine Garantien über spirituelle Erfahrungen
4. Bei Anzeichen von Krise IMMER auf Telefonseelsorge verweisen:
   0800 111 0 111 (kostenlos, 24h, anonym)
5. Gib NUR die Handynummer 0160 / 111 34 00 weiter – keine andere!

GESPRÄCHSFÜHRUNG:
- Maximal 3–4 Sätze pro Antwort
- Eine Frage am Ende wenn sinnvoll
- Nie mehrere Fragen auf einmal
- Angebote nur nennen wenn es sich natürlich ergibt
- Bei Fragen zu Preisen: immer das kostenlose Erstgespräch erwähnen`;

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
      model: 'claude-haiku-4-5-20251001',
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
