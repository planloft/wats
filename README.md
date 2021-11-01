# WATS - Wraps Around TypeScript

WATS is a small tool that wraps around:
* `tsc` (the Typescript compiler),
* `npm` (the NodeJS Package Manager) and
* `node` (the NodeJS V8 runtime)

primarily when generating ES6 modules with strict packaging conventions
on Unix-like platforms.

It reduces the *tension* amongst all these elements, and between
the **browser** and **github** as well.  It reduces the effort of
configuring and maintaining boilerplate for build tooling.

It is pronounced like 'rats', with props to Barry Kripke.

## Quick Intro

* install `node` from [nodejs](https://nodejs.org/en/download/)
* install `wats` with `npm install -g planloft/wats`
* change to your development root, eg. `cd mydevroot`
* mark your dev root `echo '{}' > wats.json`

### Usage

* create a new module `mkdir mymodule`
* change to that directory `cd mymodule`
* create a typescript file `vi mymodule.ts`
* build it by typing `wats` in that directory

### Testing

* change to the testing directory `cd testing`
* ie. you should now be in `mydevroot/mymodule/testing`
* create a typescript file `vi test-mymodule.ts`
* give it an `export function main(scena: any) ...`
* build and run it by typing `wats` in that directory
* you can also invoke it with `wats . <arg> ...`
* that will pass `<arg> ...` as `scena.args`
* [scena](https://github.com/planloft/scena) is its own project
* you don't need to include it, but it can be useful for type safety.

### Main

* you can also export a main function from a module, similar to testing 
* to invoke that, use `wats --main . <arg> ...`
* similarly, it will pass `<arg> ...` as `scena.args`
* in both cases, the `main function` can optionally return a promise
* the promise will be resolved and any errors caught in the usual way
* caught errors are processed using their `error.exitCode` property
* if undefined, the stack trace will be printed and the process will `exit(1)`
* otherwise, just the message will be printed and it will `exit(exitCode)`

### Node and Other APIS

* if you want to use node APIs from TypeScript, `vi package.json`
* add eg. `{ ..., "dependencies": { "@types/node": ">=14.0.0" }}
* typing `wats` in that directory will use npm to install it node_modules

### Other Dependencies

* express dependencies the same way through the `package.json`
* such as `{ ..., "dependencies": { "myothermod": ">=0.0.1" }}
* if `mydevroot/myothermod` exists, it will be built and linked locally
* if not, then it will attempt to install it with `npm`.

### Generated and Maintained Files and Other Interactions

* `.gitignore` if `wats.json` doesn't have `{ "generate-git-ignore": false, }`
  (on by default)
* `svn ps svn:ignore ...` if `wats.json` does have
  `{ "generate-svn-ignore": true, }` (off by default)
* `.npmignore` if it doesn't already exist (based on .gitignore if present)
* `tsconfig.json` if doesn't exist - compiler option paths are maintained
* `package.json` if it doesn't exist
See the Structure section below for more details on module and map generation.

## Pros

* your modules should work well with npm, node, git, tsc and the browser
* folks shouldn't need to compile anything to use your module if they don't
  have typescript ... 
* ... but error line numbers should line up with your TS code for bug reporting
* reduces the boilerplate/hoop-jumping required to start a new module
* allows you to co-develop modules locally without round-tripping through
  a git repo, bitbucket server, or npm; or depending on tsc composite support

## Cons

* doesn't care what your IDE wants
* highly opinionated about filesystem layout
* written to be run by node, synchronously
* requires @types/node in node_modules if you want node APIs

## Structure

Where:
```
= authored manually
+ generated if out of date
- generated if missing
? ignored by `wats`
```
The **committed** development directory structure looks something like this:

```
= wats.json                                         marks base, sets defaults
= <module>/<module>.ts                              your module's TS code
- <module>/.gitignore                               ignores node_modules etc.
- <module>/.npmignore                               also ignores testing etc.
- <module>/package.json                             the public package file
- <module>/tsconfig.json                            the public tsconfig file
+ <module>/runtime/<module>.mjs                     generated module JS code
+ <module>/runtime/<module>.js.map                  source code map to TS code
+ <module>/declare/<module>.d.ts                    generated TS exports
+ <module>/declare/<module>.d.ts.map                source code map for exports
= <module>/testing/test-<module>.ts                 your module's test TS code
+ <module>/testing/runtime/test-<module>.mjs        generated test JS code
+ <module>/testing/runtime/test-<module>.js.map     source code map to tests
```
In addition, the *not usually committed* structure looks like this:
```
- <module>/node_modules/<local-link>
- <module>/testing/node_modules/<local-link>
```
You can change that by altering `.gitignore` of course.

You can also have anything else you like in the structure, such as:
```
? <module>/.git                                     per module repo 
? <module>/README.md                                guidance
? <module>/node_modules/<some-package>              even committed dependencies
```
Notes:

* You don't have to have a `<module>/testing` tree, but it is usually a good idea.
* Public `package.json` and `tsconfig.json` files are for people importing your project.
* The `wats.json` file helps `wats` figure out how to find your locally developed modules and build them from hints in the `package.json` and `tsconfig.json` files.
* Similarly, `wats` will symlink in node_modules from your local modules.

You might notice that `wats.json` is outside of the module code -
this is because `wats` is a part of *your* development environment.
Other people should be able to develop with your modules and even
make changes without necessarily using `wats`, or even knowing
you built with it.

Note that `wats` will remove these <local-link> files when it is
asked to tidy things, so even if you do commit node_modules, if
you tidy first, it will be fine.

## Satisfied Requirements

These are some of the requirements that went into `wats`:
* be able to import any `<module>.ts` like this: `import * from '<module>'`;
* be able to run any `test-<module>.ts`, but not generally support importing
them
* have public package.json files for each project, but ignore in development
* autogenerate missing `tsconfig.json` files
* autogenerate missing `package.json` files
* not need to rebuild everything all the time
* conceive each module as a separate potential git repository
* name output modules `<module>.mjs`, especially in downstream assemblies for the browser

## The `wats.json` File

The `wats.json` file governs your local build configuration - it is 
typically under separate source code control to that of your modules.  In
other words, it is expected that you do not publish your `wats.json`, because
other people will have their own ways of managing their development
environments.  There aren't many options really and mostly an empty `{}` file
is fine to start with.  In meta JSON, it lays out like this:

```json
{
  "generate-git-ignore": true, // to generate .git-ignore files
  "generate-svn-ignore": false, // to manage svn:ignore entries
  "default-files": {
    "tsconfig.json": {
      // template JSON
    },
    "package.json": {
      // template JSON
    },
    "<module-sub-path>": "<base-sub-path>",
    "<module-sub-path>": ["line 1", "line 2", ... ],
    "<module-sub-path>": {
      // literal JSON
    }
  },
  "default-files-filter": { }
}
```

The `tsconfig.json` and `package.json` contents come from the
[template.json](template.json) file in the `wats` distribution.  They can only
override parts of the template: `wats` will report clashes.

The `<module-sub-path>` entries will be added at the top level of any module
where the `default-files-filter` matches (by default, all modules).  These are
mostly provided so that you can generate boilerplate like LICENSE files into
your projects, for example:
```
{
  "default-files": {
    "LICENSE": "myboilerplate/LICENSE"
  }
}
```

If you are working on multiple projects, some of which are 3rd party,
you might want to put together something like this:
```
{
  "default-files": {
    "package.json" {
      "author": {
        "name": "Somebody Someone",
        "email": "somebody@example.org"
      },
    },
    "LICENSE": "myboilerplate/LICENSE"
  },
  "default-files-filter": {
    "package.json": {
      "author": {
        "email": "somebody@example.org"
      }
    }
  }
}
```
This will do two things:
* populate your new projects with a `package.json` with author info
* prevent your `LICENSE` from being copied in unless that author matches

Of course, populating the "author" and other details in the `default-files`
`package.json` section is generally just a good idea - it saves more messing
around when setting up new modules.

## FAQ

1. Why `<module>/testing/` and not `<module>/test/`?  Because
'testing' is the same length as 'declare' and 'runtime'.  Yes,
really.

2. Who is Barry Kripke?  A fictional television character with a
speech impediment and savage smarts.  I have verbal issues too,
so, "way to represent"!

3. Would you support ignore for `hg` and `cvs` as well?
Sure, just ask if you need.  I still use `rcs` for some things and
I don't think that `git` is the tool for every job, though I like
it for frequent/complex branching/merging on small-to-medium repos. 
Of course, `svn` ignore support is in as above v1.0.8

4. Can you support `<some-other-transpiler-mutters-babel>`?  Maybe,
I'd have to find a compelling use case or see a really nicely
written pull request.  Feel free to fork this if you can't get
traction, just respect the [license](./LICENSE).

5. When are you going to integrate this into `<my-favo(u)rite-ide>`?
IDE builders are welcome to adopt, adapt, reproduce or even just
re-use this for inspiration.  Its really meant as the kind of tool
you can put in an automated build and deployment chain though, and
will likely stay that way.

6. Why don't you just use `tsc --build` or `<insert-tech-here>`?
These are an ill fit to the problem - they don't (didn't?) solve
my use cases at the time of writing.  I'm actually with the original
`tsc` authors on this one: they saw it more as a compiler than a
build tool.  It has since crept into build territory, but not the
way I want to use it.

7. Why don't you just use `index.ts` rather than `<module>.ts` and
`test-<module>.ts`?  For me, `index.ts` hides pertinent information that
I want to convey in different editing and deployment contexts, and also
I like to distinguish the test module from the module it is testing in
its name, not just its path.  Your mileage may vary.

## Releases

### 2021-11-01 v1.0.13

Still pre-release quality, but stabilized enough to be useful.

Typo fixes and clarifications in this `README.md` file.

Correct missing or added types declaration in package.json, rather than
complain.

### 2021-10-30 v1.0.12

Still pre-release quality, but stabilized enough to be useful.

Support declaring default-files to be automatically added if not present,
and if default-files-filter permits.

### 2021-10-24 v1.0.11

Still pre-release quality, but stabilized enough to be useful.

Provides better error messages when required properties mismatch.

### 2021-10-24 v1.0.10

Still pre-release quality, but stabilized enough to be useful.

This is a point release - it adds some test coverage and makes concrete
reference to `scena` through that (scena remains optional - it is
just a pattern really).  It also fixes an invocation bug introduced
by refactoring.

### 2021-10-24 v1.0.9

Still pre-release quality, but stabilized enough to be useful.

This is a point release - it makes reference to `scena`, but that's not
public yet - its optional in any case.

Strengthens the conditional build support and failure recovery.

Ensures that tests can report their TS position with source map support.

Changes some of the template and configuration to be more consistent.

Fixes planloft/wats#24 - handles deep chain dependencies more elegantly.
Fixes planloft/wats#23 - formalizes main and test invocation.
Fixes planloft/wats#21 - supports command line build targets.
Fixes planloft/wats#20 - more consistent dependency rebuilds.

### 2021-10-13 v1.0.8

Still pre-release quality, but stabilized enough to be useful.

Strengthens the conditional build support and failure recovery.

Ensures that tests can report their TS position with source map support.

Changes some of the template and configuration to be more consistent.

Fixes planloft/wats#18, adds support for svn:ignore.

### 2021-10-09 v1.0.7

Still pre-release quality, but stabilized enough to be useful.

Strengthens the conditional build support and failure recovery.

Ensures that tests can report their TS position with source map support.

Fixes planloft/wats#12.
Fixes planloft/wats#13.
Fixes planloft/wats#14.
Fixes planloft/wats#15.

### 2021-10-07 v1.0.6

Still pre-release quality, but stabilized enough to be useful.

Fixes bad reference.

### 2021-10-07 v1.0.5

Still pre-release quality, but stabilized enough to be useful.

Make builds conditional.

### 2021-10-06 v1.0.4

Still pre-release quality, but stabilized enough to be useful.

Fixes a testing tree initialization problem.
    
### 2021-10-06 v1.0.3

Still pre-release quality, but stabilized enough to be useful.

A packaging fix.
    
### 2021-10-06 v1.0.2
    
Still pre-release quality, but stabilized enough to be useful.

Fixes #3.  Attention to whitespace.  Changes defaults and required tsconfig.

### 2021-10-06 v1.0.1

Still pre-release quality, but being actively used elsewhere.

Fixes planloft/wats#2.
Fixes planloft/wats#5.
Fixes planloft/wats#4.

### 2021-10-06 v1.0.0

Initial release: technically it escaped from PLANLOFT labs so it could
frolic in foreign projects without friction.

