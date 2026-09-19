/** The JSON shapes the TypeSafe `/v1/systemone` endpoint accepts and returns. */

export type Entry = string | number | boolean | null | Entry[] | { [key: string]: Entry };

export interface ChoiceQuestion {
  type: "choice";
  instructions: Entry;
  criteria: Record<string, Entry>;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}
