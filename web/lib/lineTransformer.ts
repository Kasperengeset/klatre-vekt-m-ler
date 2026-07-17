// Deler en tekst-stream opp i linjer. Arduino sin Serial.println() avslutter
// hver linje med "\r\n", men vi normaliserer også vanlig "\n" i tilfelle.
export class LineBreakTransformer implements Transformer<string, string> {
  private buffer = "";

  transform(chunk: string, controller: TransformStreamDefaultController<string>) {
    this.buffer += chunk;
    const normalized = this.buffer.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      controller.enqueue(line);
    }
  }

  flush(controller: TransformStreamDefaultController<string>) {
    if (this.buffer) {
      controller.enqueue(this.buffer);
    }
  }
}
