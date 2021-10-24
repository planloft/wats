import * as mod_path from 'path';

export class NodeB {
  public join(...args: Array<string>): string {
    return (mod_path.join(...args));
  }
}
