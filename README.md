# OpenTokJS Cordova Plugin

A [Cordova](https://cordova.apache.org/) plugin to enable use of
[OpenTok](https://tokbox.com/platform) on the iOS, Android, and Browser platforms.

*WARNING:* This plugin is prerelease quality for versions less than `1.0.0`.

## Install

Using the Cordova CLI:

`$ cordova plugin add cordova-plugin-opentokjs --save --shrinkwrap`

## Configuration

The version of the opentok.js SDK included into your project can be specified by a platform
preference in your `config.xml`:

```
<preference name="OpentokClientVersion" value="v2"/>
```

The default version string is "v2". It behaves similar to semantic versioning. You can accept more
updates automatically by being less specific: "v2" matches versions greater than or equal to
"v2.0.0" and less than "v3.0.0". You can restrict updates by being more specific: "v2.6.0" matches
just that version.

## Example applications

Basic Example app: <https://github.com/aoberoi/hello-opentokjs-cordova>.

Ionic example: <https://github.com/Mobilea/cordova-plugin-opentokjs-example>.

## About this Plugin

*How is this different from the com.tokbox.cordova.opentok plugin?*

The goal of this plugin is be as maintainable and portable as possible. During development of the
[com.tokbox.cordova.opentok](http://plugins.cordova.io/#/package/com.tokbox.cordova.opentok) plugin,
it became apparent that the amount of effort it would take to maintain a JavaScript wrapper layer
which mimicked the official opentok.js SDK, even as the SDK kept receiving changes and updates, was
not sustainable for the community. In response to this observation, this plugin takes a drastically
different approach to architecture.

The approach is to run the official opentok.js client SDK, with as few changes as possible, on top
of lower level plugins that present the standard WebRTC based APIs. This is possible thanks to
projects such as [Crosswalk](https://crosswalk-project.org/) by Intel Corporation and the
[cordova-plugin-iosrtc](http://plugins.cordova.io/#/package/cordova-plugin-iosrtc) plugin from
eFace2Face, Inc.

Any source transformations to the official opentok.js client SDK that are applied within this plugin
should hopefully go away as the lower level implementations come closer to standards and the SDK
becomes more generalized to support these types of use cases.

### Known Limitations

iOS:

*  The library must be loaded manually after ensuring the iosrtc globals are inserted first. See
   sample below:

   ```javascript
   function onDeviceReady() {
     if (window.device.platform === 'iOS') {
       cordova.plugins.iosrtc.registerGlobals();
       window.OT = cordova.require('cordova-plugin-opentokjs.OpenTokClient');
     }
     // You can now use OT
   }
   ```

*  Denying access to the camera or microphone after it is requested (iOS's permission prompt) will
   cause a crash.

*  A publisher's view is not size properly. It behaves similar to `fitMode: 'contain'`, where the
   image is letter/pillar boxed into the size of the publisher element. This might also affect
   subscriber streams from other devices, but remains to be tested.

*  You cannot draw any UI over the video streams. This is a limitation imposed by the fact that the
   rendering is always done in a UIView over top of the Cordova web view.

*  Building the project in Xcode requires special care. See the
   [instructions inside the iosrtc project](https://github.com/eface2face/cordova-plugin-iosrtc/blob/master/docs/Building.md).

### New API

iOS:

*  When resizing or moving any publisher/subscriber elements (with contained `<video>` elements),
   you will need to call the `cordova.plugins.iosrtc.refreshVideos()` method after the DOM operation
   to reposition the UIViews that are over top of the web view.

## Support

Please file a GitHub Issue for any questions you might have. Someone from the community will try
to assist you when possible. This project is a community-based effort and not supported by
TokBox, Inc. Please be patient and constructive.

## Contributing

There are a few ways you can help contribute to this project:

*  If you find a bug, please file it in the GitHub Issues page. Be descriptive and include steps to
   reproduce the problem (sample code if possible).

*  If you have feature requests, file it in the Github Issues page. If you already see the feature
   you desire listed, feel free to comment within the conversation.

*  If you can offer a change or a fix, we :heart: pull requests! If its a large change, please try
   to start a discussion on the GitHub Issues before spending too much time on the work, so that you
   can get an idea of if the maintainers would be able to merge the changes. If its something small,
   such as documentation, tests, etc., go ahead and send the changes as a PR. See the development
   guidelines below.

### Development

You must have node, npm, and gulp installed to develop for this package. Run `npm install` before
beginning work.

Any changes scripts should happen in the `scripts-src` directory. Before committing changes, run the
`gulp scripts` command to build the version for the `scripts` directory.
