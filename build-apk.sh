#!/bin/bash
set -e

SDK="/opt/data/android_sdk"
BT="$SDK/build-tools/34.0.0"
PLAT="$SDK/platforms/android-34/android.jar"
APP_DIR="/opt/data/dashbrowser/android-app/app"

export PATH="$SDK/jdk-17.0.10+7/bin:$PATH"

echo "=== 1. Clean & Setup Directories ==="
rm -rf $APP_DIR/build
mkdir -p $APP_DIR/build/{gen,obj,apk,assets}

# Update assets with latest web frontend
cp -r /opt/data/dashbrowser/web/* $APP_DIR/src/main/assets/

echo "=== 2. Compiling Resources (aapt2 compile) ==="
$BT/aapt2 compile --dir $APP_DIR/src/main/res -o $APP_DIR/build/res.zip

echo "=== 3. Linking Resources (aapt2 link) ==="
$BT/aapt2 link -o $APP_DIR/build/base.apk \
  -I $PLAT \
  --manifest $APP_DIR/src/main/AndroidManifest.xml \
  --java $APP_DIR/build/gen \
  -A $APP_DIR/src/main/assets \
  $APP_DIR/build/res.zip \
  --auto-add-overlay

echo "=== 4. Compiling Java Classes ==="
javac -source 1.8 -target 1.8 \
  -bootclasspath $PLAT \
  -cp "$PLAT" \
  -d $APP_DIR/build/obj \
  $APP_DIR/src/main/java/com/dashbrowser/app/*.java \
  $APP_DIR/build/gen/com/dashbrowser/app/*.java

echo "=== 5. Dexing Bytecode (d8) ==="
$BT/d8 --output $APP_DIR/build/apk/ \
  --lib $PLAT \
  $(find $APP_DIR/build/obj -name "*.class")

echo "=== 6. Packaging APK ==="
cp $APP_DIR/build/base.apk $APP_DIR/build/unaligned.apk
cd $APP_DIR/build/apk
$SDK/jdk-17.0.10+7/bin/jar -uf $APP_DIR/build/unaligned.apk classes.dex
cd /opt/data/dashbrowser

echo "=== 7. Aligning APK (zipalign) ==="
$BT/zipalign -v -p 4 $APP_DIR/build/unaligned.apk $APP_DIR/build/aligned.apk

echo "=== 8. Signing APK (apksigner) ==="
$BT/apksigner sign --ks /opt/data/dashbrowser/debug.keystore \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out /opt/data/dashbrowser/DashBrowser.apk \
  $APP_DIR/build/aligned.apk

cp /opt/data/dashbrowser/DashBrowser.apk /opt/data/DashBrowser.apk
echo "APK successfully built at /opt/data/DashBrowser.apk"
