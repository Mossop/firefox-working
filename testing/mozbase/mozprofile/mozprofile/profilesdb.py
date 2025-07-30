# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

import os

class ProfilesIni(object):
    """
    A class to handle profiles.ini files.
    """
    def __init__(self, app_data):
        self.app_data = app_data
        self.profiles = []
        self.installs = {}

    def add_profile(self, name, path):
        relative_path = self._relative_path(path)
        is_relative = 1 if relative_path != path else 0

        self.profiles.append({
            "name": name,
            "path": relative_path,
            "is_relative": is_relative,
        })

    def _relative_path(self, path):
        if os.path.commonpath([self.app_data, path]) == self.app_data:
            return os.path.relpath(path, self.app_data)
        return path

    def write(self):
        os.makedirs(self.app_data, exist_ok=True)
        fp = open(os.path.join(self.app_data, "profiles.ini"), "w")

        fp.write("[General]\n")
        fp.write("StartWithLastProfile=1\n")
        fp.write("Version=2\n")

        for idx, profile in enumerate(self.profiles):
            fp.write("\n[Profile{}]\n".format(idx))
            fp.write("Name={}\n".format(profile["name"]))
            fp.write("Path={}\n".format(profile["path"]))
            fp.write("IsRelative={}\n".format(profile["is_relative"]))

        for binary_hash, profile_path in self.installs.items():
            fp.write("\n[Install{}]\n".format(binary_hash))
            fp.write("Default={}\n".format(profile_path))
            fp.write("Locked=1\n")

        fp.close()
