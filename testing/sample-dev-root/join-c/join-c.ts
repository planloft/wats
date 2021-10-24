import { ChainA } from 'chain-a';
import { NodeB } from 'node-b';
import { Scena, Failure } from 'scena';

export function main(scena: Scena): void {
  var args = scena.args;

  console.log("got args", args.length, ...args);

  if (args.length) {
    throw new Failure(parseInt(args.shift() as string), "exit with code");
  }
}

export class JoinC {
  constructor (
      public readonly chainA: ChainA,
      public readonly nodeB: NodeB) {
  }
}

