/**
 * Large, shared player-name pool. Keeping it in a separate module makes the
 * generator easy to expand without bloating transfer logic.
 */
export const PLAYER_FIRST_NAMES = ["Aaron", "Abel", "Adam", "Adrian", "Aiden", "Akira", "Alec", "Alejandro", "Alex", "Amir", "Andre", "Andres", "Angelo", "Anton", "Antonio", "Aras", "Archie", "Ari", "Arjun", "Arlo", "Arthur", "Ash", "Asher", "Atlas", "Axel", "Bastian", "Ben", "Benjamin", "Blake", "Bodhi", "Bruno", "Bryn", "Cairo", "Caleb", "Callum", "Carlos", "Carter", "Casper", "Cedric", "Cesar", "Charlie", "Chris", "Ciro", "Cole", "Connor", "Daan", "Damian", "Daniel", "Dante", "Dario", "David", "Declan", "Diego", "Dominic", "Dylan", "Eamon", "Eden", "Eduardo", "Eli", "Elias", "Elijah", "Elliot", "Emil", "Emilio", "Enzo", "Eric", "Ethan", "Evan", "Ezra", "Fabian", "Fabio", "Felix", "Finn", "Florian", "Flynn", "Francis", "Franco", "Gabriel", "Gael", "Gareth", "Gavin", "George", "Gian", "Gianni", "Gideon", "Gio", "Giorgio", "Grayson", "Hector", "Hugo", "Ian", "Idris", "Iker", "Isaac", "Isaiah", "Ivan", "Jace", "Jack", "Jacob", "Jaime", "James", "Javier", "Jayden", "Jett", "Joel", "Johan", "Jonas", "Jordan", "Jorge", "Joseph", "Joshua", "Josiah", "Jude", "Julian", "Kacper", "Kai", "Karim", "Kian", "Kieran", "Koa", "Kobe", "Kristian", "Lars", "Leo", "Leon", "Leonardo", "Levi", "Liam", "Luca", "Lucas", "Luis", "Luka", "Marco", "Marcus", "Mario", "Martin", "Mateo", "Matias", "Matteo", "Max", "Maximilian", "Micah", "Michael", "Miguel", "Mika", "Milan", "Milo", "Nico", "Nicolas", "Niko", "Nils", "Noah", "Nolan", "Omar", "Orin", "Oscar", "Otis", "Owen", "Pablo", "Paolo", "Parker", "Patrick", "Paul", "Pedro", "Phoenix", "Rafael", "Rayan", "Remy", "Ren", "Rian", "Ricardo", "Rio", "Robert", "Roberto", "Roman", "Ronan", "Rowan", "Ruben", "Rune", "Ryan", "Sami", "Samuel", "Santiago", "Sebastian", "Sergio", "Silas", "Simon", "Sol", "Stefan", "Theo", "Thiago", "Thomas", "Tobias", "Tomas", "Tristan", "Tyler", "Uri", "Valentin", "Victor", "Vincent", "Wesley", "William", "Xavier", "Yassin", "Yuki", "Yuri", "Yusuf", "Zaid", "Zane", "Zion"] as const;

export const PLAYER_LAST_NAMES = ["Abadi", "Acosta", "Adler", "Ahn", "Albrecht", "Alder", "Alves", "Andersen", "Andrade", "Antonov", "Archer", "Arslan", "Ashford", "Atkinson", "Avila", "Bae", "Bailey", "Baker", "Balogun", "Banerjee", "Baran", "Barnes", "Bauer", "Becker", "Bell", "Bello", "Benitez", "Bennett", "Berg", "Bernard", "Bianchi", "Bishop", "Blake", "Blanco", "Borrelli", "Bowen", "Boyd", "Brandt", "Braun", "Brooks", "Brown", "Bruno", "Burke", "Calder", "Campos", "Cano", "Caruso", "Castillo", "Castro", "Choi", "Clarke", "Cohen", "Cole", "Costa", "Cruz", "Cullen", "Dacruz", "Dahl", "Dalton", "Davies", "Dawson", "DeLuca", "Delgado", "Diaz", "Dominguez", "Doyle", "Duarte", "Dunn", "Eden", "Edwards", "Elias", "Ellis", "Emerson", "Eriksen", "Evans", "Farah", "Fischer", "Flores", "Ford", "Foster", "Franco", "Franke", "Fraser", "Frost", "Fujimoto", "Garcia", "Gardner", "Georgiou", "Gibson", "Gilbert", "Gomes", "Gonzalez", "Grant", "Greene", "Griffin", "Guerrero", "Gutierrez", "Haas", "Haddad", "Hale", "Hansen", "Harper", "Hart", "Hayes", "Henderson", "Herrera", "Hill", "Hoffmann", "Hoshino", "Howard", "Huerta", "Hughes", "Hunt", "Ibarra", "Iglesias", "Ivanov", "Jackson", "Jacobs", "Jensen", "Jimenez", "Johnson", "Jones", "Jordan", "Kader", "Kamara", "Kane", "Kaplan", "Karimov", "Keller", "Kim", "King", "Klein", "Knight", "Kobayashi", "Kovac", "Kramer", "Kruger", "Lane", "Larsen", "Laurent", "Lee", "Legrand", "Lewis", "Li", "Lind", "Liu", "Lopez", "Lowe", "Maeda", "Malik", "Marin", "Marquez", "Martin", "Martinez", "Mason", "Matsuda", "Mayer", "Medina", "Meyer", "Miller", "Mills", "Mitchell", "Molina", "Monroe", "Moreno", "Morgan", "Mueller", "Nakamura", "Nash", "Navarro", "Nguyen", "Nielsen", "Novak", "Ocampo", "Ochoa", "Okafor", "Olsen", "Ortiz", "Osborne", "Osei", "Owen", "Park", "Patel", "Pereira", "Petrov", "Pike", "Pires", "Porter", "Powell", "Quay", "Quinn", "Ramos", "Reed", "Reyes", "Rios", "Rivera", "Roberts", "Rocha", "Rodrigues", "Romero", "Rossi", "Rowe", "Ruiz", "Russo", "Saito", "Salazar", "Sanchez", "Santos", "Schmidt", "Schneider", "Silva", "Singh", "Smith", "Soto", "Spencer", "Stein", "Stewart", "Stone", "Suarez", "Suzuki", "Tanaka", "Taylor", "Thomas", "Toma", "Torres", "Townsend", "Tran", "Turner", "Ueda", "Valdez", "Vale", "Vargas", "Vega", "Velasquez", "Vidal", "Vieira", "Villanueva", "Voss", "Wagner", "Walker", "Wallace", "Wang", "Ward", "Weber", "White", "Williams", "Wilson", "Wong", "Wright", "Yamada", "Young", "Zoric"] as const;

const usedGeneratedNames = new Set<string>();

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function registerGeneratedPlayerNames(names: Iterable<string>): void {
  for (const name of names) {
    if (typeof name === "string" && name.trim()) {
      usedGeneratedNames.add(normalizeName(name));
    }
  }
}

export function generateUniquePlayerName(
  seed: number,
  avoidNames: Iterable<string> = [],
): string {
  const blocked = new Set([...avoidNames].map(normalizeName));
  const total = PLAYER_FIRST_NAMES.length * PLAYER_LAST_NAMES.length;
  const safeSeed = Math.abs(Math.trunc(seed)) || 1;

  for (let attempt = 0; attempt < Math.min(total, 4096); attempt += 1) {
    const firstIndex = (safeSeed + attempt * 37) % PLAYER_FIRST_NAMES.length;
    const lastIndex = (Math.floor(safeSeed / 97) + attempt * 53) % PLAYER_LAST_NAMES.length;
    const candidate = `${PLAYER_FIRST_NAMES[firstIndex]} ${PLAYER_LAST_NAMES[lastIndex]}`;
    const key = normalizeName(candidate);
    if (!blocked.has(key) && !usedGeneratedNames.has(key)) {
      usedGeneratedNames.add(key);
      return candidate;
    }
  }

  // Extremely defensive fallback: the suffix only appears if every normal
  // combination checked above is already in use.
  const fallback = `${PLAYER_FIRST_NAMES[safeSeed % PLAYER_FIRST_NAMES.length]} ${PLAYER_LAST_NAMES[(safeSeed >>> 7) % PLAYER_LAST_NAMES.length]} ${safeSeed.toString(36).toUpperCase()}`;
  usedGeneratedNames.add(normalizeName(fallback));
  return fallback;
}
