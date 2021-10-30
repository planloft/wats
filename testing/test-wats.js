const mod_wats = require('../wats.js');
const mod_fs = require('fs');
const mod_process = require('process');
const mod_path = require('path');
const sampleDevRootPath = mod_path.resolve('./sample-dev-root');
const devRootPath = mod_path.resolve('.testdata');

function copyTo(targetPath, sourcePath) {
  var stat = mod_fs.lstatSync(sourcePath);

  if (stat.isDirectory()) {
    var targetStat = undefined;

    try {
      targetStat = mod_fs.lstatSync(targetPath);
    }
    catch (e) {
      // ignore error and try mkdir instead
      mod_fs.mkdirSync(targetPath);
    }

    if ((targetStat !== undefined) && !targetStat.isDirectory()) {
      throw new Error("Target path " + targetPath + " was expected to be" +
        " a directory");
    }

    for (var subPath of mod_fs.readdirSync(sourcePath, 'UTF-8')) {
      copyTo(mod_path.join(targetPath, subPath),
        mod_path.join(sourcePath, subPath));
    }
  }
  else if (stat.isSymbolicLink()) {
    mod_fs.symlinkSync(readsymlinkSync(sourcePath), targetPath);
  }
  else if (stat.isFile()) {
    mod_fs.writeFileSync(targetPath, mod_fs.readFileSync(sourcePath));
  }
}

function setup() {
  mod_wats.unlinkPath(devRootPath);
  copyTo(devRootPath, sampleDevRootPath);
}

function clean() {
  mod_wats.unlinkPath(devRootPath);
}

function run(runSubPath, ...args) {
  const runPath = mod_path.join(devRootPath, runSubPath);

  mod_wats.main({ cwd: runPath, args: args });
}

/**
 * Expect takes a path and expected value.  The value may be
 * * boolean false - the path should not exist
 * * boolean true - the path should exist
 * * a string - the path should be a symbolic link with the string value
 * * a map - the path should be a directory, and the key value pairs should
 *   be similarly checked by constructing a path and passing in the value.
 */
function expectIn(checkPath, value) {
  var failure = undefined;

  try {
    mod_fs.lstatSync(checkPath);
  }
  catch (e) {
    failure = e;
  }

  if (value === false) {
    if (failure === undefined) {
      throw new Error("Expected not to find: " + checkPath);
    }
  }
  else {
    if (failure !== undefined) {
      throw new Error("Expected to find: " + checkPath);
    }

    if (value === false) {
      // no need to go further
    }
    else if (typeof(value) === 'string') {
      var link = mod_fs.readlinkSync(checkPath);

      if (link !== value) {
        throw new Error("Link for " + checkPath + " is " + link +
          " when " + value + " was expected.");
      }
    }
    else if (value instanceof Array) {
      throw new Error("not supported");
    }
    else {
      for (var subPath in value) {
        expectIn(mod_path.join(checkPath, subPath), value[subPath]);
      }
    }
  }
}

function expectExitCode(code, fn) {
  var failure = undefined;

  try {
    fn();
  }
  catch (e) {
    failure = e;
  }

  if (failure === undefined) {
    throw new Error("Function did not fail as expected.");
  }

  if (failure.exitCode === undefined) {
    throw new Error("Function did not set exit code as expected.");
  }

  if (failure.exitCode !== code) {
    throw new Error("Function did not set exit code to value expected: " +
      failure.exitCode + " (expected " + code +").");
  }
}

function expectTree(map) {
  expectIn(devRootPath, map);
}

setup();

// After the initial copy, there are certain things we don't expect to exist:
expectTree({
    "wats.json": true,
    "simple": {
      ".npmignore": false,
      ".gitignore": false,
      "tsconfig.json": false,
      "package.json": false,
      "runtime": false,
      "declare": false,
      "LICENSE": false,
    },
  });

run("simple");

// After the initial run though, they should all be there, and populated.
expectTree({
    "wats.json": true,
    "simple": {
      ".npmignore": true,
      ".gitignore": true,
      "tsconfig.json": true,
      "package.json": true,
      "runtime": {
        "simple.mjs": true,
        "simple.js.map": true,
      },
      "declare": {
        "simple.d.ts": true,
        "simple.d.ts.map": true,
      },
      "LICENSE": true,
    },
  });

var simpleMJSTime = mod_wats.modificationTimeOf(mod_path.join(devRootPath,
  "simple/runtime/simple.mjs"));

run("simple");

if (simpleMJSTime !== mod_wats.modificationTimeOf(mod_path.join(devRootPath,
    "simple/runtime/simple.mjs"))) {
  throw new Error("Should not have rebuilt here.");
}

expectTree({
    "wats.json": true,
    "chain-a": {
      ".npmignore": false,
      ".gitignore": false,
      "tsconfig.json": false,
      "package.json": true,
      "runtime": false,
      "declare": false,
      "node_modules": false,
      "testing": {
        ".npmignore": false,
        ".gitignore": false,
        "tsconfig.json": false,
        "package.json": false,
        "runtime": false,
        "declare": false,
      },
    },
  });

run("chain-a");

/*
  After the initial run though, they should all be there, and populated,
  but this time, since we have a declared dependency in package.json and
  it corresponds to the sibling module, we should find a link in node_modules,
  miminally expressing the relative path to that module.

  The chain-a/testing directory will be supplemented with configuration files,
  but will not actually be built.
*/
expectTree({
    "wats.json": true,
    "chain-a": {
      ".npmignore": true,
      ".gitignore": true,
      "tsconfig.json": true,
      "package.json": true,
      "runtime": {
        "chain-a.mjs": true,
        "chain-a.js.map": true,
      },
      "declare": {
        "chain-a.d.ts": true,
        "chain-a.d.ts.map": true,
      },
      "node_modules": {
        "simple": "../../simple",
      },
      "testing": {
        ".npmignore": false,
        ".gitignore": true,
        "tsconfig.json": true,
        "package.json": true,
        "runtime": false,
        "declare": false,
      },
    },
  });

if (simpleMJSTime !== mod_wats.modificationTimeOf(mod_path.join(devRootPath,
    "simple/runtime/simple.mjs"))) {
  throw new Error("Should not have rebuilt here.");
}

expectTree({
    "wats.json": true,
    "node-b": {
      ".npmignore": false,
      ".gitignore": false,
      "tsconfig.json": false,
      "package.json": true,
      "runtime": false,
      "declare": false,
      "node_modules": false,
    },
  });

run("node-b");

expectTree({
    "wats.json": true,
    "node-b": {
      ".npmignore": true,
      ".gitignore": true,
      "tsconfig.json": true,
      "package.json": true,
      "runtime": {
        "node-b.mjs": true,
        "node-b.js.map": true,
      },
      "declare": {
        "node-b.d.ts": true,
        "node-b.d.ts.map": true,
      },
      "node_modules": {
        "@types": {
          "node": true,
        },
      },
    },
  });

run("join-c");

/*
  chain-a/testing is a no-promise style test - it returns nothing.
*/
run("chain-a/testing");

/*
  Once chain-a/testing has been run, it should have been built and
  it should also run its test.  Unlike modules, testing subdirs
  do not generate declare files, since they are not invoked in that
  way.
*/
expectTree({
    "wats.json": true,
    "chain-a": {
      ".npmignore": true,
      ".gitignore": true,
      "tsconfig.json": true,
      "package.json": true,
      "runtime": {
        "chain-a.mjs": true,
        "chain-a.js.map": true,
      },
      "declare": {
        "chain-a.d.ts": true,
        "chain-a.d.ts.map": true,
      },
      "node_modules": {
        "simple": "../../simple",
      },
      "testing": {
        ".npmignore": false,
        ".gitignore": true,
        "tsconfig.json": true,
        "package.json": true,
        "runtime": {
          "test-chain-a.mjs": true,
          "test-chain-a.js.map": true,
        },
        "declare": false,
      },
    },
  });

var failure = undefined;

/*
  node-b/testing is a promise-style test - it actually always throws
  though, and the invoker should exit with exit code 70.
*/
try {
  run("node-b/testing");
}
catch (e) {
  failure = e;
}

if (failure === undefined) {
  throw new Error("expected node-b/testing to fail");
}

if (failure.exitCode != 70) {
  throw new Error("expected node-b/testing to exit with code 70");
}

/*
  An external package - it should not get our default-files apart
  from the usual tsconfig.json maintenance.
*/
run("other-d");

expectTree({
    "other-d": {
      "LICENSE": false,
    },
  });

clean();
setup();

/*
  Should build everything in turn.
*/
run("join-c");

var joinCMJSTime = mod_wats.modificationTimeOf(mod_path.join(devRootPath,
  "join-c/runtime/join-c.mjs"));

// next, overlay skeleton onto .testdata dev root
copyTo(devRootPath, mod_path.resolve('./skeleton-stage-1'));

// Rerun the build - should only rebuild chain-a though.
run("join-c");

if (joinCMJSTime !== mod_wats.modificationTimeOf(mod_path.join(devRootPath,
    "join-c/runtime/join-c.mjs"))) {
  throw new Error("Should not have rebuilt here.");
}

// Make sure we can run with a target ...
mod_wats.main({
  cwd: mod_process.cwd(),
  args: [mod_path.relative(mod_process.cwd(),
    mod_path.resolve(devRootPath, "chain-a"))],
  });

// Make sure we can't invoke main accidentally ...
expectExitCode(64, () => {
    mod_wats.main({
        cwd: mod_process.cwd(),
        args: [mod_path.relative(mod_process.cwd(),
          mod_path.resolve(devRootPath, "chain-a")), "x"]
      });
  });

// Make sure we can't invoke main on a test package ...
expectExitCode(64, () => {
    mod_wats.main({
        cwd: mod_process.cwd(),
        args: [mod_path.relative(mod_process.cwd(), "--main",
          mod_path.resolve(devRootPath, "chain-a/testing"))],
      });
  });

run("join-c", "--main");

expectExitCode(65, () => {
    run("join-c", "--main", ".", 65);
  });

clean();
