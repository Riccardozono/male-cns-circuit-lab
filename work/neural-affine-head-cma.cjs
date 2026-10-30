'use strict';
// CMA receives only complete measured fitness. Every bounded vector written
// back into pending is the exact vector sent to the physical evaluator.
const { Search: Base } = require('./neural-head-cma-transport.cjs');
const { LIMITS, IDENTITY } = require('./neural-affine-motor-head.cjs');

class Search extends Base {
  constructor(config) {
    super(config);
    if (config.mean?.length !== 4 || config.population !== 16 || config.sigma > 1
      || config.mean.some((value, index) => value < LIMITS[index][0] || value > LIMITS[index][1])) {
      throw Error('Bounded four-parameter affine search required');
    }
  }

  ask(elite = IDENTITY) {
    const rows = super.ask(elite);
    return rows.map((row, index) => {
      const bounded = row.map((value, dimension) => Math.max(LIMITS[dimension][0], Math.min(LIMITS[dimension][1], value)));
      this.pending[index].x = bounded.slice();
      return bounded;
    });
  }
}

if (require.main === module) {
  let search;
  require('node:readline').createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
    let id = null;
    try {
      if (line.length > 32768) throw Error('Bounded coefficient request required');
      const message = JSON.parse(line); id = message.id;
      if (!Number.isInteger(id)) throw Error('Request ID required');
      let result;
      if (message.op === 'init') {
        if (search) throw Error('Already initialized');
        search = new Search(message); result = { initialized: true, limits: LIMITS };
      } else if (!search) throw Error('Initialize first');
      else if (message.op === 'ask') result = search.ask(message.elite ?? IDENTITY);
      else if (message.op === 'tell') result = search.tell(message.fitness);
      else if (message.op === 'state') result = search.state();
      else throw Error('Unsupported operation');
      process.stdout.write(JSON.stringify({ id, result }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ id, error: error.stack }) + '\n'); }
  });
}

module.exports = { Search };
