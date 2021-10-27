#!/usr/bin/env node
var exitCode = 0;

try {
  var args = [...process.argv];

  args.shift(); // skip over node

  while (args.length && args[0].startsWith("-")) {
    args.shift(); // skip over node option
  }

  if (args.length) {
    args.shift(); // skip over this command
  }

  var scena = {
      cwd: process.cwd(),
      args: args,
    };

  require('./wats.js').main(scena);
}
catch (e) {
  if (e.exitCode != null) {
    exitCode = e.exitCode;
    console.log(e.message);
  }
  else {
    exitCode = 1;
    console.log(e);
  }
}

process.exit(exitCode);
