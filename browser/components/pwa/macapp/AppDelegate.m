//
//  AppDelegate.m
//  PWA
//
//  Created by Dave Townsend on 8/16/19.
//  Copyright © 2019 Dave Townsend. All rights reserved.
//

#import "AppDelegate.h"

@interface AppDelegate () {
    CFReadStreamRef readStream;
    CFWriteStreamRef writeStream;
}

@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
}

- (void)stream:(NSStream *)stream handleEvent:(NSStreamEvent)eventCode {
}


- (void)applicationWillTerminate:(NSNotification *)aNotification {
    // Insert code here to tear down your application
}


@end
