interface LifeYears {
  birth_year_ec?: number;
  death_year_ec?: number;
}

export function formatLifeYears(person: LifeYears): string | undefined {
  if (person.birth_year_ec != null && person.death_year_ec != null) {
    return `${person.birth_year_ec} EC - ${person.death_year_ec} EC`;
  }
  if (person.birth_year_ec != null) return `${person.birth_year_ec} EC`;
  if (person.death_year_ec != null) return `${person.death_year_ec} EC`;
  return undefined;
}
