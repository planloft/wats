import { Simple } from 'simple';

export class ChainA implements Simple {
	public exposed(): void {
    this.notExposed();
	}

	private notExposed(): void {
	}
}

