//
//  main.m
//  PWA
//
//  Created by Dave Townsend on 8/16/19.
//  Copyright © 2019 Dave Townsend. All rights reserved.
//

#include "mozilla/Bootstrap.h"
#import <Cocoa/Cocoa.h>

using namespace mozilla;

Bootstrap::UniquePtr gBootstrap;

int main(int argc, char * argv[]) {
    gBootstrap = GetBootstrap("/Users/dave/mozilla/build/trunk/obj-browser-dbg-full/dist/NightlyDebug.app/Contents/MacOS/firefox");
    gBootstrap->XRE_InitPWAProcess("", argc, argv);
}
