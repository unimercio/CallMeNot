# CallGuard Screener — Native Android Call Screening & Anti-Spam App

CallGuard is a native Android application built with **Kotlin**, **Jetpack Compose**, **Room Database**, and Android's native **Telecom `CallScreeningService` API** (Target SDK 35, Min SDK 26).

It intercepts incoming calls locally on your Android device before your phone rings, matching numbers against an offline SQLite database and STIR/SHAKEN caller ID verification status.

---

## 📁 Repository Structure

- `android/` — **Native Android Application Source Code (Open in Android Studio)**
  - `android/app/src/main/java/com/enrique/callguard/` — Kotlin source code:
    - `service/CallScreeningServiceImpl.kt` — Core Android OS background screening service
    - `data/` — Room SQLite local database, entities, and DAOs
    - `ui/` — Modern Jetpack Compose UI (Dashboard, Blacklist Manager, Call Logs)
  - `android/app/src/main/AndroidManifest.xml` — Declares `CallScreeningService` and permissions
  - `android/app/build.gradle.kts` — Gradle dependencies (Target SDK 35)
- `src/` — React & Tailwind Web Simulator & Deployment Guide Component
- `README.md` — Project Documentation

---

## 🚀 How to Build the APK in Android Studio

1. **Clone or Download Repository**:
   Export this repository via ZIP or GitHub.
2. **Open in Android Studio**:
   Launch Android Studio (Koala, Ladybug, or 2024.1+) and click **Open**. Select the **`android/`** directory.
3. **Gradle Sync**:
   Allow Gradle to download dependencies (Jetpack Compose, Room SQLite, Telecom APIs). Ensure Gradle JDK is set to **Java 17+**.
4. **Build Release APK**:
   - In Android Studio menu: **Build > Generate Signed Bundle / APK...**
   - Select **APK**, choose your release keystore, and select build variant **release**.
   - Or via terminal inside `android/`:
     ```bash
     ./gradlew assembleRelease
     ```
   - The compiled APK will be at `android/app/build/outputs/apk/release/app-release.apk`.

---

## 📲 Post-Installation Setup on Physical Android Phone

After installing the APK on your phone:
1. Open **CallGuard**.
2. Grant **Contacts & Phone State** permissions when prompted.
3. Set CallGuard as your **Default Caller ID & Spam App**:
   - Go to Android **Settings > Apps > Default Apps > Caller ID & Spam app** -> Select **CallGuard Screener**.

All screening operates **100% offline** on-device with zero server dependencies or background battery drain.
