export interface CheatsheetSection {
  id: string;
  label: string;
  icon: string;
  md: string;
  docsRef?: string;
  group?: string;
}

export interface CheatsheetRecipe {
  id: string;
  title: string;
  description: string;
  md: string;
  /** id секций, которые задействует рецепт — для перекрёстных ссылок. */
  sections: string[];
}

export interface CheatsheetRegistry {
  sections: CheatsheetSection[];
  recipes: CheatsheetRecipe[];
}
