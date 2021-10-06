#!/usr/bin/env node
require('./wats.js').executeIn(process.cwd(), ...((...args) => {
    args.shift(); // skip over node

    while (args.length && args[0].startsWith("-")) {
      args.shift(); // skip over node option
    }

    if (args.length) {
      args.shift(); // skip over this command
    }

    return (args);
  })(...process.argv));
