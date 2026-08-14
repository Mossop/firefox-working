# "downgrade" ping

This ping is captured when attempting to use a profile that was previously used
with a newer version of the application.

This ping is submitted directly through the `` `pingsender` ``. The common ping
data relates to the profile and application that the user attempted to use.

The client ID and profile group ID are submitted with this ping. No environment block is
included with this ping.

Structure:

```js
{
  type: "downgrade",
  ... common ping data
  clientId: <UUID>,
  profileGroupId: <UUID>,
  payload: {
    lastVersion: "", // The last version of the application that ran this profile
    lastBuildId: "", // The last build ID of the application that ran this profile
    hasSync: <bool>, // Whether the profile is signed in to sync
    button: <int> // The button the user chose to click from the UI:
                  //   0 - Quit
                  //   1 - Create new profile
    isMSIX: <bool>, // Whether this install is an MSIX package
    profileSelectionReason: "", // How the profile was selected during startup (see the startup.profile_selection_reason metric)
    secondsSinceLock: <int>, // (optional) Seconds since the profile lock was last held
    secondsSinceInstall: <int>, // (Windows only, optional) Seconds since the current installation was installed
    secondsSinceUpdate: <int>, // (optional) Seconds since the last update was applied
    isDifferentInstall: <bool>, // Whether the profile was last used by a different install of the application
  }
}
```
