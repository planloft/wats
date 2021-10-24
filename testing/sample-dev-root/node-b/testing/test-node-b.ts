class MyError extends Error {
  constructor (public readonly exitCode: number, message: string) {
    super (message);
  }
}

export async function main(scena: any): Promise<void> {
  const error = new MyError(70, "oops " + scena.args.join(", "));

  throw error;
}
