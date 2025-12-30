/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_profile_switching_removes_and_reinserts() {
  Services.prefs.setBoolPref("browser.profiles.enabled", true);
  Services.prefs.setBoolPref("browser.profiles.created", true);

  await initSelectableProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  Assert.ok(SelectableProfileService.isEnabled, "Service should be enabled");
  Assert.ok(
    SelectableProfileService.currentProfile,
    "Should have a current profile"
  );

  const originalProfileData = {
    name: SelectableProfileService.currentProfile.name,
    avatar: SelectableProfileService.currentProfile.avatar,
    theme: SelectableProfileService.currentProfile.theme,
  };

  const originalStoreID = await ProfilesDatastoreService.storeID;

  await ProfilesDatastoreService.switchStore("newstore");

  const newStoreID = await ProfilesDatastoreService.storeID;

  Assert.notEqual(originalStoreID, newStoreID, "StoreID should have changed");
  Assert.equal(newStoreID, "newstore", "StoreID should be the new value");

  Assert.ok(
    SelectableProfileService.currentProfile,
    "Should still have a current profile after switch"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.name,
    originalProfileData.name,
    "Profile name should be preserved"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.avatar,
    originalProfileData.avatar,
    "Profile avatar should be preserved"
  );

  Assert.deepEqual(
    SelectableProfileService.currentProfile.theme,
    originalProfileData.theme,
    "Profile theme should be preserved"
  );

  await SelectableProfileService.uninit();
  await ProfilesDatastoreService.uninit();
});

add_task(async function test_profile_switching_updates_existing_profile() {
  Services.prefs.setBoolPref("browser.profiles.enabled", true);
  Services.prefs.setBoolPref("browser.profiles.created", true);

  await initSelectableProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  await SelectableProfileService.currentProfile.setNameAsync("Updated Name");

  await ProfilesDatastoreService.switchStore("updated-store");

  Assert.equal(
    SelectableProfileService.currentProfile.name,
    "Updated Name",
    "Profile name should reflect the update"
  );

  await SelectableProfileService.uninit();
  await ProfilesDatastoreService.uninit();
});

add_task(async function test_profile_switching_handles_new_store() {
  Services.prefs.setBoolPref("browser.profiles.enabled", true);
  Services.prefs.setBoolPref("browser.profiles.created", true);

  await initSelectableProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  const originalProfileData =
    SelectableProfileService.currentProfile.toDbObject();

  await ProfilesDatastoreService.switchStore("brandnew");

  Assert.ok(
    SelectableProfileService.currentProfile,
    "Should have a current profile after switching to new store"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.name,
    originalProfileData.name,
    "Profile should be inserted into new store with correct name"
  );

  await SelectableProfileService.uninit();
  await ProfilesDatastoreService.uninit();
});

add_task(async function test_profile_data_persists_across_switch() {
  Services.prefs.setBoolPref("browser.profiles.enabled", true);
  Services.prefs.setBoolPref("browser.profiles.created", true);

  await initSelectableProfileService();

  const SelectableProfileService = getSelectableProfileService();
  const ProfilesDatastoreService = getProfilesDatastoreService();

  await SelectableProfileService.currentProfile.setNameAsync("Test Profile");
  await SelectableProfileService.currentProfile.setAvatar("book");
  SelectableProfileService.currentProfile.theme = {
    themeId: "test-theme",
    themeFg: "rgb(255,0,0)",
    themeBg: "rgb(0,0,255)",
  };

  await ProfilesDatastoreService.switchStore("persist-test");

  Assert.equal(
    SelectableProfileService.currentProfile.name,
    "Test Profile",
    "Name should persist"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.avatar,
    "book",
    "Avatar should persist"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.theme.themeId,
    "test-theme",
    "Theme ID should persist"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.theme.themeFg,
    "rgb(255,0,0)",
    "Theme foreground should persist"
  );

  Assert.equal(
    SelectableProfileService.currentProfile.theme.themeBg,
    "rgb(0,0,255)",
    "Theme background should persist"
  );

  await SelectableProfileService.uninit();
  await ProfilesDatastoreService.uninit();
});
