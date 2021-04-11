interface AnnotatedEntry {
  text: string;
  priority: number | null;
  score: number;
  key?: string | null;
  relations?: string[];
}