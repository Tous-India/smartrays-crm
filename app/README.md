This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Smartrays app — things this project pins

## The Metro port is 8081, in one place

`android/gradle.properties` sets `reactNativeDevServerPort=8081`, and `npm start` /
`npm run android` pass `--port 8081`. Keep them in step; if you ever need a different
port, change all three.

**Why it is pinned:** the React Native Gradle plugin bakes whatever port the build was
launched with into the APK, as the `react_native_dev_server_port` resource. A debug build
started from an IDE that had picked 8082 produces an app that talks *only* to 8082, and a
Metro running on 8081 then answers with a red box — "The development server returned
response error code: 500", or simply no bundle. Nothing in the app is wrong at that point;
the two sides are just on different ports.

If you meet that red box anyway, check which port the installed APK expects:

```sh
"$ANDROID_HOME/build-tools/<version>/aapt2" dump resources android/app/build/outputs/apk/debug/app-debug.apk | grep -A1 react_native_dev_server_port
```

and make sure exactly one Metro is listening on it (`npx react-native start --port <that>`;
on Windows a stale Metro keeps the port and the new one exits with `EADDRINUSE`). On an
emulator, `adb reverse tcp:<port> tcp:<port>` after every reboot.

## Firebase (push notifications)

`android/app/google-services.json` is **not** committed — it is per Firebase project and
gitignored. The Google-services Gradle plugin is applied only when that file exists, so a
checkout without it still builds and runs; push notifications simply stay off (the app logs
nothing and registers no device token). Drop the file in and rebuild to turn them on. The
backend's side needs `FCM_ENABLED=true` and the three `FIREBASE_*` values — see
`backend/.env.example`.

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
