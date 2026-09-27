/** Katalogeintrag; id verbindet DOM-Auswahl, Physikkörper und API-Bewertung. */
export type Emoji = { id: string; symbol: string; label: string };
/** Kompakte Katalogdaten im Format Symbol|Bezeichnung; die Reihenfolge bestimmt die IDs. */
const entries = [
'🍏|Grüner Apfel','🍎|Roter Apfel','🍐|Birne','🍊|Mandarine','🍋|Zitrone','🍌|Banane','🍉|Wassermelone','🍇|Weintrauben','🍓|Erdbeere','🫐|Blaubeeren','🍈|Honigmelone','🍒|Kirschen','🍑|Pfirsich','🥭|Mango','🍍|Ananas','🥥|Kokosnuss','🥝|Kiwi','🍅|Tomate','🍆|Aubergine','🥑|Avocado','🥦|Brokkoli','🥬|Blattgemüse','🥒|Gurke','🌶️|Chili','🫑|Paprika','🌽|Mais','🥕|Karotte','🫒|Oliven','🧄|Knoblauch','🧅|Zwiebel',
'🥔|Kartoffel','🍠|Süßkartoffel','🥐|Croissant','🥯|Bagel','🍞|Brot','🥖|Baguette','🥨|Brezel','🧀|Käse','🥚|Ei','🍳|Spiegelei','🥞|Pfannkuchen','🧇|Waffel','🥓|Speck','🥩|Steak','🍗|Hähnchenkeule','🌭|Hotdog','🍔|Hamburger','🍟|Pommes frites','🍕|Pizza','🥪|Sandwich','🥙|Gefülltes Fladenbrot','🌮|Taco','🌯|Burrito','🥗|Salat','🍝|Spaghetti','🍜|Nudelsuppe','🍣|Sushi','🍩|Donut','🍪|Keks','🎂|Geburtstagstorte',
'🍰|Kuchen','🧁|Cupcake','🍫|Schokolade','🍬|Bonbon','🍭|Lutscher','🍦|Softeis','🍿|Popcorn','🥜|Erdnüsse','🍯|Honig','🥛|Milch','☕|Kaffee','🍵|Tee','🧃|Saft','🥤|Softdrink','🧋|Bubble Tea','🍺|Bier','🍷|Wein','🍸|Cocktail','💧|Wassertropfen','🐶|Hund','🐱|Katze','🐭|Maus','🐹|Hamster','🐰|Kaninchen','🦊|Fuchs','🐻|Bär','🐼|Panda','🐨|Koala','🐯|Tiger','🦁|Löwe',
'🐮|Kuh','🐷|Schwein','🐸|Frosch','🐵|Affe','🐔|Huhn','🐧|Pinguin','🐦|Vogel','🦆|Ente','🦉|Eule','🦋|Schmetterling','🐝|Biene','🐞|Marienkäfer','🐢|Schildkröte','🐍|Schlange','🦖|Dinosaurier','🐙|Oktopus','🐠|Tropischer Fisch','🐬|Delfin','🐳|Wal','🦈|Hai','🌸|Kirschblüte','🌻|Sonnenblume','🌹|Rose','🌵|Kaktus','🌲|Nadelbaum','🌴|Palme','🍀|Kleeblatt','🍄|Pilz','☀️|Sonne','🌈|Regenbogen',
'🎸|Gitarre','🥁|Schlagzeug','🎹|Klavier','🎷|Saxofon','🎺|Trompete','🎻|Geige','🪕|Banjo','🎤|Mikrofon','🎧|Kopfhörer','🎼|Notenblatt','🎵|Musiknote','📻|Radio','🔊|Lautsprecher','🎬|Filmklappe','🎨|Farbpalette','🎭|Theater','📷|Kamera','📚|Bücher','✏️|Bleistift','💻|Laptop','📱|Smartphone','💡|Glühbirne','🔬|Mikroskop','🔭|Teleskop','🧪|Reagenzglas','🛠️|Werkzeug','✂️|Schere','🧵|Garn','🎮|Gamecontroller','🎲|Würfel',
'⚽|Fußball','🏀|Basketball','🎾|Tennisball','🏈|Football','⚾|Baseball','🏐|Volleyball','🏓|Tischtennis','🏸|Badminton','🥊|Boxhandschuh','🛹|Skateboard','🚲|Fahrrad','🛼|Rollschuhe','⛷️|Skifahrer','🏄|Surfer','🏊|Schwimmer','🚗|Auto','🚌|Bus','🚂|Zug','✈️|Flugzeug','🚀|Rakete','⛵|Segelboot','🏠|Haus','🏕️|Camping','🏖️|Strand','🏔️|Berg','🌍|Erde','🧳|Koffer','🎈|Luftballon','🎁|Geschenk','❤️|Herz',
];
/** Gemeinsamer Katalog für Browser und Server; Umordnen der Einträge verändert ihre IDs. */
export const EMOJIS: Emoji[] = entries.map((entry, index) => {
  const [symbol, label] = entry.split('|');
  return { id: `emoji_${index}`, symbol, label };
});
/** Erfolgreiche API-Antwort, die der Browser je normalisiertem Suchtext zwischenspeichert. */
export type Classification = {
  /** Vollständige Zuordnung der Katalog-IDs zu Wahrscheinlichkeiten im Bereich [0, 1]. */
  scores: Record<string, number>;
  /** Serverseitig gemessene Dauer des Anbieteraufrufs einschließlich Antwortauswertung in ms. */
  elapsedMs: number;
  /** Vom Anbieter gemeldete Kosten in US-Dollar; null bedeutet nicht verfügbar. */
  costUsd: number | null;
  /** Vom Anbieter gemeldeter Modellname oder das angefragte Modell als Ersatzwert. */
  model: string;
  /** Getrimmter Suchtext zur Zuordnung und zum Schutz vor veralteten Ergebnissen. */
  query: string;
};
/** Suchvorschläge in derselben Reihenfolge wie die Beispielbuttons der Oberfläche. */
export const EXAMPLES = ['Dinge zum Essen', 'Gesunde Dinge zum Essen', 'Ungesunde Dinge zum Essen', 'Eine Band gründen'];
