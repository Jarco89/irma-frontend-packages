# IRMA legacy / irmajs

`irma-legacy` is a wrapper around `irma-core` and several `irma-frontend-packages` plugins realizing backwards
compatibility with the legacy [`irmajs` Javascript library](https://github.com/privacybydesign/irmajs).
`irmajs` provides a Javascript client of the RESTful JSON API offered by the
[`irma server`](https://github.com/privacybydesign/irmago/tree/master/irma). 
It allows you to use the `irma server` to:

 * Verify IRMA attributes. You specify which attributes, the library handles the user interaction
   and the communication with the `irma server` and the [IRMA app](https://github.com/privacybydesign/irma_mobile)).
 * Issue IRMA attributes.
 * Create IMRA attribute-based signatures: signature on a string to which
   IRMA attributes are verifiably attached.
 
**Only use this module when you need backwards compatibility with the legacy `irmajs` function calls.
If you are new to `irma-frontend-packages`, please use the `irma-frontend` module or make your own
composition of plugins and use `irma-core` as main module.**

## Differences with irmajs
Due to technical changes in IRMA, we were not able to realize full backwards compatibility with `irmajs`.
All changes are related to the function call `handleSession`.
 * Method `canvas` is not supported anymore. Please use the module `irma-frontend` instead or make
   your own composition of plugins and layouts using `irma-core`.
   This also means the canvas related options `element` and `showConnectedIcon` are deprecated.
 * Method `mobile` has the same behaviour as method `popup` now. On mobile devices, the popup
   mode automatically detects whether a mobile device is used and then shows the user the option to open
   the IRMA app installed on the mobile device itself. It is now an explicit choice, so users can also get
   a QR on mobile devices instead (useful for tablets).
 * The option `disableMobile` is not useful anymore and therefore deprecated. This module does not have
   automatic redirects to other apps anymore without explicit user interaction.
 * Because the explicit methods for mobile devices are deprecated, the undocumented exported function
   `detectUserAgent` and the undocumented exported struct `UserAgent` are also deprecated. An explicit
   distinction based on user agent is not necessary anymore. This is all handled internally now.
 * The option `returnStatus` is deprecated. Instead you can use the functions `waitConnected` and `waitDone`
   to detect yourself whether the session reached a certain status.
   
If you experience problems concerning the backwards compatibility other than the ones mentioned above,
please contact us. It might be something we were not aware of. Then we can maybe fix it.

## Documentation

Technical documentation of `irmajs` can be found at [irma.app/docs](https://irma.app/docs/irmajs).

## Building

Compile the library:

    npm install
    npm run build

This writes `irma.js` and `irma.node.js` to the `dist` folder. `irma.js` is the browser variant,
which you can include in your website in a `<script>` tag. `irma.node.js` is the library variant
for usage in node.js. To reduce the module size, the JWT support is split off in the separate files
`jwt.js` and `vendors~jwt.js`. When you want to use the function `signSessionRequest`, these
files must be available in the same directory as `irma.js` or `irma.node.js`.

## Browser example

If you have included `irma.js` (e.g. `<script src="irma.js" defer></script>`) you can start an IRMA
disclosure session as follows:

```javascript
const request = {
  '@context': 'https://irma.app/ld/request/disclosure/v2',
  'disclose': [
    [
      [ 'irma-demo.MijnOverheid.ageLower.over18' ]
    ]
  ]
};

irma.startSession(server, request)
    .then(({ sessionPtr, token }) => irma.handleSession(sessionPtr, {server, token}))
    .then(result => console.log('Done', result));
```

The example assumes you have an `irma server` that is configured to accept unauthenticated session
requests listening at the URL indicated by `server`. More information about the format of session
requests can be found in the [documentation](https://irma.app/docs/session-requests/).

For complete examples, see the `irma-legacy` examples in the `examples` folder.

## Development
If you want to build one of the included `irma-frontend-packages` modules from
source, for example when testing, please make sure you run `./build.sh`
in the root directory of `irma-frontend-packages`.
You can link local versions of modules easily using `npm link`. There is
an explanation about how to use `npm link` in the README of the
[`irma-frontend-packages` root directory](https://github.com/privacybydesign/irma-frontend-packages).

