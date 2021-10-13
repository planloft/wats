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
* build and run it by typing `wats` in that directory

### Node APIS

* if you want to use node APIs from TypeScript, `vi package.json`
* add eg. `{ ..., "dependencies": { "@types/node": ">=14.0.0" }}
* build by typing `wats` in that directory
* if it is test code, it will also run it

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
asked to clean things, so even if you do commit node_modules, if
you clean first, it will be fine.

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

