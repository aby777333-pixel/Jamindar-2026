// Opening links outside the app.
//
// Bug report 22: tapping the Location map left a SECOND "Jamin Bazaar" entry in
// Android's Recent Apps, blank and black. expo-web-browser defaults to
// `createTask: true`, which launches the Custom Tab as its own task — Android
// labels that task with the host app, so one app looked like two, and the empty
// shell stayed behind after the tab was dismissed.
//
// `createTask: false` keeps the browser in our own task: one Recents entry, and
// Back returns to the screen the link was tapped from. iOS has no equivalent
// concept (the option is Android-only and ignored elsewhere).
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

/** Open a URL in the in-app browser without spawning a second Android task. */
export function openExternal(url?: string | null): void {
  if (!url) return;
  const opts: WebBrowser.WebBrowserOpenOptions =
    Platform.OS === "android" ? { createTask: false } : {};
  WebBrowser.openBrowserAsync(url, opts).catch(() => {});
}
