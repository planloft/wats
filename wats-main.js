/*
  Loads the module provided as the first command line argument (after node
  has stripped all of its own invocation, apart from its path).  Invokes
  the main() function exported from that module with {} and the remaining args.
  The {} will likely be expanded into an object that contains environment,
  and streams in the future.  For now, it is empty.

  Awaits a result from the function (the function need not be asynchronous
  or return a promise however) and catches any errors thrown by the function
  or the resolution of its promise.  If the error has an exitCode field,
  the message is printed and process is exited with that code.  If the
  error doesn't have a code, then the whole error and stack are printed
  and the process is exited with the code 1.  If no error is caught, then
  the process continues until it exits normally - it is not forcibly
  exited.

  This code is loaded by wats.js and actually passed as an argument itself
  for command line evaluation.
*/
const args = [...process.argv];

// Skip over node.
args.shift();

if (!args.length) {
  console.log("Invoked without a test argument.");
  process.exit(1);
}

// First argument should be the test to load (with ./ prefix already added).
const testReference = args.shift();
const testModule = await import(testReference);

if (testModule.main === undefined) {
  console.log("The module " + testReference + " does not export 'main'.");
  process.exit(1);
}

if (!(testModule.main instanceof Function)) {
  console.log("The export " + testReference + "#main" +
    " is not a function.");
  process.exit(1);
}

// Invoke with Scena using cwd and the remaining arguments.
try {
  await testModule.main({ cwd: process.cwd(), args : args });
}
catch (e) {
  if (e.exitCode !== undefined) {
    console.log(e.message);
    process.exit(e.exitCode);
  }

  console.log(e);
  process.exit(1);
}
