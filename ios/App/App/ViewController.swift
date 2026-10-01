import UIKit
import Capacitor

/// Bridge view controller for a full-screen landscape game (spec 01 §7).
/// The status bar and the home indicator are hidden by Info.plist and by
/// Capacitor's SystemBars (`hidden: true` in capacitor.config.ts); this adds
/// what Capacitor does not cover.
class ViewController: CAPBridgeViewController {
    /// System gestures from any edge need a second swipe, so a thumb on the
    /// joystick or the fire button near the edge is not taken by iOS.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        .all
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // The screen never dims or locks while the game is open.
        UIApplication.shared.isIdleTimerDisabled = true
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        setNeedsUpdateOfHomeIndicatorAutoHidden()
    }
}
