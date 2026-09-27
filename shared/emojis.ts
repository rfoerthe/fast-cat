export type Emoji = { id: string; symbol: string; label: string };
const entries = [
'🍏|Grüner Apfel','🍎|Roter Apfel','🍐|Birne','🍊|Mandarine','🍋|Zitrone','🍌|Banane','🍉|Wassermelone','🍇|Weintrauben','🍓|Erdbeere','🫐|Blaubeeren','🍈|Honigmelone','🍒|Kirschen','🍑|Pfirsich','🥭|Mango','🍍|Ananas','🥥|Kokosnuss','🥝|Kiwi','🍅|Tomate','🍆|Aubergine','🥑|Avocado','🥦|Brokkoli','🥬|Blattgemüse','🥒|Gurke','🌶️|Chili','🫑|Paprika','🌽|Mais','🥕|Karotte','🫒|Oliven','🧄|Knoblauch','🧅|Zwiebel',
'🥔|Kartoffel','🍠|Süßkartoffel','🥐|Croissant','🥯|Bagel','🍞|Brot','🥖|Baguette','🥨|Brezel','🧀|Käse','🥚|Ei','🍳|Spiegelei','🥞|Pfannkuchen','🧇|Waffel','🥓|Speck','🥩|Steak','🍗|Hähnchenkeule','🌭|Hotdog','🍔|Hamburger','🍟|Pommes frites','🍕|Pizza','🥪|Sandwich','🥙|Gefülltes Fladenbrot','🌮|Taco','🌯|Burrito','🥗|Salat','🍝|Spaghetti','🍜|Nudelsuppe','🍣|Sushi','🍩|Donut','🍪|Keks','🎂|Geburtstagstorte',
'🍰|Kuchen','🧁|Cupcake','🍫|Schokolade','🍬|Bonbon','🍭|Lutscher','🍦|Softeis','🍿|Popcorn','🥜|Erdnüsse','🍯|Honig','🥛|Milch','☕|Kaffee','🍵|Tee','🧃|Saft','🥤|Softdrink','🧋|Bubble Tea','🍺|Bier','🍷|Wein','🍸|Cocktail','💧|Wassertropfen','🐶|Hund','🐱|Katze','🐭|Maus','🐹|Hamster','🐰|Kaninchen','🦊|Fuchs','🐻|Bär','🐼|Panda','🐨|Koala','🐯|Tiger','🦁|Löwe',
'🐮|Kuh','🐷|Schwein','🐸|Frosch','🐵|Affe','🐔|Huhn','🐧|Pinguin','🐦|Vogel','🦆|Ente','🦉|Eule','🦋|Schmetterling','🐝|Biene','🐞|Marienkäfer','🐢|Schildkröte','🐍|Schlange','🦖|Dinosaurier','🐙|Oktopus','🐠|Tropischer Fisch','🐬|Delfin','🐳|Wal','🦈|Hai','🌸|Kirschblüte','🌻|Sonnenblume','🌹|Rose','🌵|Kaktus','🌲|Nadelbaum','🌴|Palme','🍀|Kleeblatt','🍄|Pilz','☀️|Sonne','🌈|Regenbogen',
'🎸|Gitarre','🥁|Schlagzeug','🎹|Klavier','🎷|Saxofon','🎺|Trompete','🎻|Geige','🪕|Banjo','🎤|Mikrofon','🎧|Kopfhörer','🎼|Notenblatt','🎵|Musiknote','📻|Radio','🔊|Lautsprecher','🎬|Filmklappe','🎨|Farbpalette','🎭|Theater','📷|Kamera','📚|Bücher','✏️|Bleistift','💻|Laptop','📱|Smartphone','💡|Glühbirne','🔬|Mikroskop','🔭|Teleskop','🧪|Reagenzglas','🛠️|Werkzeug','✂️|Schere','🧵|Garn','🎮|Gamecontroller','🎲|Würfel',
'⚽|Fußball','🏀|Basketball','🎾|Tennisball','🏈|Football','⚾|Baseball','🏐|Volleyball','🏓|Tischtennis','🏸|Badminton','🥊|Boxhandschuh','🛹|Skateboard','🚲|Fahrrad','🛼|Rollschuhe','⛷️|Skifahrer','🏄|Surfer','🏊|Schwimmer','🚗|Auto','🚌|Bus','🚂|Zug','✈️|Flugzeug','🚀|Rakete','⛵|Segelboot','🏠|Haus','🏕️|Camping','🏖️|Strand','🏔️|Berg','🌍|Erde','🧳|Koffer','🎈|Luftballon','🎁|Geschenk','❤️|Herz',
];
export const EMOJIS: Emoji[] = entries.map((entry, index) => {
  const [symbol, label] = entry.split('|');
  return { id: `emoji_${index}`, symbol, label };
});
export type Classification = { scores: Record<string, number>; elapsedMs: number; costUsd: number | null; model: string; query: string };
export const EXAMPLES = ['Dinge zum Essen', 'Gesunde Dinge zum Essen', 'Ungesunde Dinge zum Essen', 'Eine Band gründen'];
