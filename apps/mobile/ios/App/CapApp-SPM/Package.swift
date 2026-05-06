// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.1"),
        .package(name: "CapacitorCommunitySafeArea", path: "../../../../../node_modules/.bun/@capacitor-community+safe-area@8.0.1+2a604cb248d57ff2/node_modules/@capacitor-community/safe-area"),
        .package(name: "CapacitorBarcodeScanner", path: "../../../../../node_modules/.bun/@capacitor+barcode-scanner@3.0.2+2a604cb248d57ff2/node_modules/@capacitor/barcode-scanner"),
        .package(name: "CapacitorClipboard", path: "../../../../../node_modules/.bun/@capacitor+clipboard@8.0.1+2a604cb248d57ff2/node_modules/@capacitor/clipboard"),
        .package(name: "CapacitorKeyboard", path: "../../../../../node_modules/.bun/@capacitor+keyboard@8.0.3+2a604cb248d57ff2/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorNetwork", path: "../../../../../node_modules/.bun/@capacitor+network@8.0.1+2a604cb248d57ff2/node_modules/@capacitor/network"),
        .package(name: "CapacitorPreferences", path: "../../../../../node_modules/.bun/@capacitor+preferences@8.0.1+2a604cb248d57ff2/node_modules/@capacitor/preferences")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunitySafeArea", package: "CapacitorCommunitySafeArea"),
                .product(name: "CapacitorBarcodeScanner", package: "CapacitorBarcodeScanner"),
                .product(name: "CapacitorClipboard", package: "CapacitorClipboard"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences")
            ]
        )
    ]
)
