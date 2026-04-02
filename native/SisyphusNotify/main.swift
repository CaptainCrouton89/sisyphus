import Cocoa
import UserNotifications

// Long-lived notification helper.
// Reads JSON lines from stdin: {"title":"...","message":"...","tmuxSession":"..."}
// Stays alive to handle click callbacks.
// Send SIGTERM or close stdin to stop.

class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    private var authorized = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        // Register category with "Switch" action
        let switchAction = UNNotificationAction(
            identifier: "SWITCH",
            title: "Switch",
            options: [.foreground]
        )
        let category = UNNotificationCategory(
            identifier: "SISYPHUS",
            actions: [switchAction],
            intentIdentifiers: []
        )
        center.setNotificationCategories([category])

        // Request permission
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                fputs("Authorization error: \(error.localizedDescription)\n", stderr)
            }
            self.authorized = granted
            if !granted {
                fputs("Notification permission denied\n", stderr)
            }
            // Start reading stdin for notification requests
            self.startStdinReader()
        }
    }

    private func startStdinReader() {
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                guard !line.isEmpty else { continue }
                guard let data = line.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
                    fputs("Invalid JSON: \(line)\n", stderr)
                    continue
                }
                let title = json["title"] ?? "Sisyphus"
                let message = json["message"] ?? ""
                let tmuxSession = json["tmuxSession"]

                self.sendNotification(title: title, message: message, tmuxSession: tmuxSession)
            }
            // stdin closed — exit
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    private func sendNotification(title: String, message: String, tmuxSession: String?) {
        guard authorized else {
            fputs("Not authorized to send notifications\n", stderr)
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = message
        content.sound = .default
        content.categoryIdentifier = "SISYPHUS"

        var userInfo: [String: String] = [:]
        if let s = tmuxSession { userInfo["tmuxSession"] = s }
        content.userInfo = userInfo

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                fputs("Failed: \(error.localizedDescription)\n", stderr)
            }
        }
    }

    // Show banner even when app is "in foreground" (it's a background daemon)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    // Click handler — runs the switch script
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let tmuxSession = userInfo["tmuxSession"] as? String

        if let session = tmuxSession {
            let script = NSHomeDirectory() + "/.sisyphus/notify-switch.sh"
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/bin/bash")
            task.arguments = [script, session]
            task.environment = ["PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"]
            try? task.run()
            task.waitUntilExit()
        }

        completionHandler()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
