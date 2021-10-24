#!/usr/bin/env node
var exitCode = 0;

try {
  require('./wats.js').main({ cwd: process.cwd(), args = ((...args) => {
      args.shift(); // skip over node

      while (args.length && args[0].startsWith("-")) {
        args.shift(); // skip over node option
      }

      if (args.length) {
        args.shift(); // skip over this command
      }

      return (args);
    })(...process.argv));
}
catch (e) {
  if (e.exitCode != null) {
    exitCode = e.exitCode;
  }
  else {
    exitCode = 1;
    console.log(e);
  }
}

process.exit(exitCode);
