#!/usr/bin/env python3
"""
WARFRONT: DOMINION - self-contained Android APK builder.

The build machine has no Android SDK (no aapt2/d8/apksigner), so this script
implements the needed pieces directly:
  * binary AndroidManifest.xml (AXML) encoder
  * resources.arsc encoder (launcher icon in several densities)
  * javac (against android.jar) + dx (compiled from AOSP source) -> classes.dex
  * zip writer with 4-byte alignment for stored entries (zipalign equivalent)
  * APK Signature Scheme v2 + v3-compatible v2 signer (RSA-2048 / SHA-256)

Usage: python3 build_apk.py --game ../game --out ../dist/WarfrontDominion.apk
"""
import argparse, hashlib, io, os, shutil, struct, subprocess, sys, tempfile, zlib, datetime

ANDROID_JAR = os.environ.get("ANDROID_JAR", "/opt/sdk/ap/android-33/android.jar")
DX_JAR = os.environ.get("DX_JAR", "/opt/sdk/dx.jar")

PKG = "com.warfront.dominion"
VERSION_CODE = 1
VERSION_NAME = "1.0.0"
MIN_SDK = 24
TARGET_SDK = 33
APP_LABEL = "Warfront: Dominion"

ANDROID_NS = "http://schemas.android.com/apk/res/android"
ATTR = {
    "theme": 0x01010000, "label": 0x01010001, "icon": 0x01010002, "name": 0x01010003,
    "exported": 0x01010010, "launchMode": 0x0101001d, "screenOrientation": 0x0101001e,
    "configChanges": 0x0101001f, "minSdkVersion": 0x0101020c, "versionCode": 0x0101021b,
    "versionName": 0x0101021c, "targetSdkVersion": 0x01010270, "allowBackup": 0x01010280,
    "hardwareAccelerated": 0x010102d3, "largeHeap": 0x0101035a, "isGame": 0x010103f4,
    "resizeableActivity": 0x010104f6, "appCategory": 0x01010545,
}
T_REF, T_STRING, T_INT_DEC, T_INT_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12

# ---------------------------------------------------------------- string pool
def string_pool(strings, utf8=False):
    """ResStringPool chunk (UTF-16)."""
    offsets, data = [], bytearray()
    for s in strings:
        offsets.append(len(data))
        u = s.encode("utf-16-le")
        n = len(s)
        if n > 0x7FFF:
            data += struct.pack("<HH", 0x8000 | (n >> 16), n & 0xFFFF)
        else:
            data += struct.pack("<H", n)
        data += u + b"\x00\x00"
    while len(data) % 4:
        data += b"\x00"
    hdr_size = 28
    strings_start = hdr_size + 4 * len(strings)
    total = strings_start + len(data)
    out = struct.pack("<HHIIIIII", 0x0001, hdr_size, total, len(strings), 0, 0, strings_start, 0)
    out += b"".join(struct.pack("<I", o) for o in offsets) + bytes(data)
    return out

# ---------------------------------------------------------------- AXML
class Elem:
    def __init__(self, tag, attrs=None, children=None):
        self.tag, self.attrs, self.children = tag, attrs or [], children or []

def a(name, typ, val, android=True):
    return (name, typ, val, android)

def encode_axml(root):
    # Collect strings: android attribute names first (to align with resource map)
    attr_names = []
    def walk(e):
        for (n, t, v, an) in e.attrs:
            if an and n not in attr_names:
                attr_names.append(n)
        for c in e.children: walk(c)
    walk(root)
    attr_names.sort(key=lambda n: ATTR[n])
    strings = list(attr_names)
    def sid(s):
        if s not in strings: strings.append(s)
        return strings.index(s)
    sid("android"); sid(ANDROID_NS)
    def collect(e):
        sid(e.tag)
        for (n, t, v, an) in e.attrs:
            sid(n)
            if t == T_STRING: sid(v)
        for c in e.children: collect(c)
    collect(root)

    body = bytearray()
    ns_i, prefix_i = strings.index(ANDROID_NS), strings.index("android")
    line = [1]
    def node_hdr(typ, size):
        line[0] += 1
        return struct.pack("<HHIII", typ, 16, size, line[0], 0xFFFFFFFF)
    body += node_hdr(0x0100, 24) + struct.pack("<II", prefix_i, ns_i)

    def emit(e):
        # sort: attrs with resource ids by id, then plain attrs
        attrs = sorted(e.attrs, key=lambda x: (0, ATTR[x[0]]) if x[3] else (1, x[0]))
        ab = bytearray()
        for (n, t, v, an) in attrs:
            ns = ns_i if an else 0xFFFFFFFF
            if t == T_STRING:
                raw = strings.index(v); data = strings.index(v)
            elif t == T_BOOL:
                raw = 0xFFFFFFFF; data = 0xFFFFFFFF if v else 0
            else:
                raw = 0xFFFFFFFF; data = v
            ab += struct.pack("<IIIHBBI", ns, strings.index(n), raw, 8, 0, t, data & 0xFFFFFFFF)
        ext = struct.pack("<IIHHHHHH", 0xFFFFFFFF, strings.index(e.tag), 20, 20, len(attrs), 0, 0, 0)
        nonlocal_body.extend(node_hdr(0x0102, 16 + len(ext) + len(ab)) + ext + ab)
        for c in e.children: emit(c)
        nonlocal_body.extend(node_hdr(0x0103, 24) + struct.pack("<II", 0xFFFFFFFF, strings.index(e.tag)))
    nonlocal_body = body
    emit(root)
    body += node_hdr(0x0101, 24) + struct.pack("<II", prefix_i, ns_i)

    sp = string_pool(strings)
    resmap = struct.pack("<HHI", 0x0180, 8, 8 + 4 * len(attr_names)) + b"".join(struct.pack("<I", ATTR[n]) for n in attr_names)
    payload = sp + resmap + bytes(body)
    return struct.pack("<HHI", 0x0003, 8, 8 + len(payload)) + payload

def build_manifest():
    activity = Elem("activity", [
        a("name", T_STRING, PKG + ".MainActivity"),
        a("label", T_STRING, APP_LABEL),
        a("exported", T_BOOL, True),
        a("launchMode", T_INT_DEC, 2),                # singleTask
        a("screenOrientation", T_INT_DEC, 6),         # sensorLandscape
        a("configChanges", T_INT_HEX, 0x0FB0 | 0x1000 | 0x2000),
        a("theme", T_REF, 0x0103000a),                # Theme.Black.NoTitleBar.Fullscreen
        a("hardwareAccelerated", T_BOOL, True),
        a("resizeableActivity", T_BOOL, True),
    ], [Elem("intent-filter", [], [
        Elem("action", [a("name", T_STRING, "android.intent.action.MAIN")]),
        Elem("category", [a("name", T_STRING, "android.intent.category.LAUNCHER")]),
    ])])
    app = Elem("application", [
        a("label", T_STRING, APP_LABEL),
        a("icon", T_REF, 0x7f010000),
        a("allowBackup", T_BOOL, True),
        a("hardwareAccelerated", T_BOOL, True),
        a("largeHeap", T_BOOL, True),
        a("isGame", T_BOOL, True),
        a("appCategory", T_INT_DEC, 0),               # game
    ], [activity])
    root = Elem("manifest", [
        a("versionCode", T_INT_DEC, VERSION_CODE),
        a("versionName", T_STRING, VERSION_NAME),
        a("package", T_STRING, PKG, android=False),
    ], [
        Elem("uses-sdk", [a("minSdkVersion", T_INT_DEC, MIN_SDK), a("targetSdkVersion", T_INT_DEC, TARGET_SDK)]),
        Elem("uses-feature", [a("name", T_STRING, "android.hardware.touchscreen")]),
        app,
    ])
    return encode_axml(root)

# ---------------------------------------------------------------- ARSC
DENSITIES = [("mdpi", 160, 48), ("hdpi", 240, 72), ("xhdpi", 320, 96), ("xxhdpi", 480, 144), ("xxxhdpi", 640, 192)]

def res_config(density):
    # ResTable_config, 64 bytes, all wildcards except density
    c = bytearray(64)
    struct.pack_into("<I", c, 0, 64)
    struct.pack_into("<H", c, 14, density)  # screenType.density at offset 14 (orientation@12, touchscreen@13)
    return bytes(c)

def build_arsc():
    paths = ["res/mipmap-%s-v4/ic_launcher.png" % d for d, _, _ in DENSITIES]
    gpool = string_pool(paths)
    type_pool = string_pool(["mipmap"])
    key_pool = string_pool(["ic_launcher"])

    spec = struct.pack("<HHIBBHI", 0x0202, 16, 16 + 4, 1, 0, 0, 1) + struct.pack("<I", 0x100)  # CONFIG_DENSITY
    types = b""
    for i, (d, dens, _) in enumerate(DENSITIES):
        hdr_size = 20 + 64
        entries = struct.pack("<HHI", 8, 0, 0) + struct.pack("<HBBI", 8, 0, T_STRING, i)
        offsets = struct.pack("<I", 0)
        entries_start = hdr_size + len(offsets)
        total = entries_start + len(entries)
        types += struct.pack("<HHIBBHII", 0x0201, hdr_size, total, 1, 0, 0, 1, entries_start) + res_config(dens) + offsets + entries

    name = PKG.encode("utf-16-le").ljust(256, b"\x00")
    pkg_hdr_size = 288
    type_off = pkg_hdr_size
    key_off = type_off + len(type_pool)
    pkg_body = type_pool + key_pool + spec + types
    pkg = struct.pack("<HHII", 0x0200, pkg_hdr_size, pkg_hdr_size + len(pkg_body), 0x7f) + name + \
        struct.pack("<IIIII", type_off, 1, key_off, 1, 0) + pkg_body
    payload = gpool + pkg
    return struct.pack("<HHII", 0x0002, 12, 12 + len(payload), 1) + payload, paths

# ---------------------------------------------------------------- dex
def build_dex(src_dir, work):
    classes = os.path.join(work, "classes"); os.makedirs(classes, exist_ok=True)
    srcs = [os.path.join(r, f) for r, _, fs in os.walk(src_dir) for f in fs if f.endswith(".java")]
    subprocess.check_call(["javac", "-nowarn", "-source", "8", "-target", "8", "-encoding", "UTF-8",
                           "-bootclasspath", ANDROID_JAR, "-classpath", ANDROID_JAR, "-d", classes] + srcs,
                          stderr=subprocess.DEVNULL if False else None)
    dex = os.path.join(work, "classes.dex")
    subprocess.check_call(["java", "-cp", DX_JAR, "com.android.dx.command.Main", "--dex",
                           "--min-sdk-version=%d" % MIN_SDK, "--output=" + dex, classes])
    return open(dex, "rb").read()

# ---------------------------------------------------------------- zip (aligned)
def dos_time():
    t = datetime.datetime(2026, 10, 20, 12, 0, 0)
    return ((t.hour << 11) | (t.minute << 5) | (t.second // 2)), (((t.year - 1980) << 9) | (t.month << 5) | t.day)

def write_zip(entries):
    """entries: list of (name, bytes, compress:bool). Stored entries are 4-byte aligned (.so would need 4096)."""
    out = bytearray(); central = bytearray(); tm, dt = dos_time()
    for name, data, compress in entries:
        nb = name.encode("utf-8"); crc = zlib.crc32(data) & 0xFFFFFFFF
        if compress:
            co = zlib.compressobj(9, zlib.DEFLATED, -15); cdata = co.compress(data) + co.flush(); method = 8
        else:
            cdata = data; method = 0
        offset = len(out)
        extra = b""
        if method == 0:
            data_start = offset + 30 + len(nb)
            pad = (-data_start) % 4
            extra = b"\x00" * pad
        out += struct.pack("<IHHHHHIIIHH", 0x04034b50, 20, 0x0800, method, tm, dt, crc, len(cdata), len(data), len(nb), len(extra)) + nb + extra + cdata
        central += struct.pack("<IHHHHHHIIIHHHHHII", 0x02014b50, 20, 20, 0x0800, method, tm, dt, crc, len(cdata), len(data),
                               len(nb), 0, 0, 0, 0, 0, offset) + nb
    cd_off = len(out)
    eocd = struct.pack("<IHHHHIIH", 0x06054b50, 0, 0, len(entries), len(entries), len(central), cd_off, 0)
    return bytes(out), bytes(central), eocd

# ---------------------------------------------------------------- v2 signing
def lp(b): return struct.pack("<I", len(b)) + b

def chunk_digest(sections):
    digests = []
    for sec in sections:
        for i in range(0, len(sec), 1 << 20):
            c = sec[i:i + (1 << 20)]
            digests.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(c)) + c).digest())
    return hashlib.sha256(b"\x5a" + struct.pack("<I", len(digests)) + b"".join(digests)).digest()

def load_or_make_key(keydir):
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    kp, cp = os.path.join(keydir, "release.key.pem"), os.path.join(keydir, "release.cert.pem")
    if os.path.exists(kp) and os.path.exists(cp):
        key = serialization.load_pem_private_key(open(kp, "rb").read(), None)
        cert = x509.load_pem_x509_certificate(open(cp, "rb").read())
        return key, cert
    os.makedirs(keydir, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Warfront Dominion"),
                      x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Warfront Studio")])
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now)
            .not_valid_after(now + datetime.timedelta(days=365 * 30)).sign(key, hashes.SHA256()))
    open(kp, "wb").write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    open(cp, "wb").write(cert.public_bytes(serialization.Encoding.PEM))
    return key, cert

def sign_v2(zip_body, central, eocd, key, cert):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    digest = chunk_digest([zip_body, central, eocd])
    ALG = 0x0103  # RSASSA-PKCS1-v1_5 with SHA2-256
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    signed_data = lp(lp(struct.pack("<I", ALG) + lp(digest))) + lp(lp(cert_der)) + lp(b"")
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signer = lp(signed_data) + lp(lp(struct.pack("<I", ALG) + lp(sig))) + lp(pub)
    value = lp(lp(signer))
    pair = struct.pack("<Q", 4 + len(value)) + struct.pack("<I", 0x7109871a) + value
    block_size = len(pair) + 8 + 16
    block = struct.pack("<Q", block_size) + pair + struct.pack("<Q", block_size) + b"APK Sig Block 42"
    new_cd_off = len(zip_body) + len(block)
    eocd2 = eocd[:16] + struct.pack("<I", new_cd_off) + eocd[20:]
    return zip_body + block + central + eocd2

# ---------------------------------------------------------------- main
def make_icons(src_png):
    from PIL import Image
    im = Image.open(src_png).convert("RGBA")
    out = []
    for d, _, px in DENSITIES:
        b = io.BytesIO(); im.resize((px, px), Image.LANCZOS).save(b, "PNG", optimize=True); out.append(b.getvalue())
    return out

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default=os.path.join(root, "game"))
    ap.add_argument("--icon", default=os.path.join(root, "android", "icon.png"))
    ap.add_argument("--out", default=os.path.join(root, "dist", "WarfrontDominion.apk"))
    ap.add_argument("--keys", default=os.path.join(root, "android", "keys"))
    args = ap.parse_args()

    work = tempfile.mkdtemp(prefix="wfapk")
    try:
        manifest = build_manifest()
        arsc, icon_paths = build_arsc()
        dex = build_dex(os.path.join(root, "android", "src"), work)
        icons = make_icons(args.icon)
        entries = [("AndroidManifest.xml", manifest, True), ("classes.dex", dex, True), ("resources.arsc", arsc, False)]
        for p, data in zip(icon_paths, icons):
            entries.append((p, data, False))
        for r, dirs, files in os.walk(args.game):
            dirs.sort()
            for f in sorted(files):
                full = os.path.join(r, f)
                rel = os.path.relpath(full, args.game).replace(os.sep, "/")
                if rel.startswith("tests/") or f.startswith("."):
                    continue
                data = open(full, "rb").read()
                compress = not f.lower().endswith((".png", ".jpg", ".ogg", ".mp3"))
                entries.append(("assets/game/" + rel, data, compress))
        body, central, eocd = write_zip(entries)
        key, cert = load_or_make_key(args.keys)
        apk = sign_v2(body, central, eocd, key, cert)
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        open(args.out, "wb").write(apk)
        print("APK written: %s (%.1f KB, %d entries)" % (args.out, len(apk) / 1024, len(entries)))
    finally:
        shutil.rmtree(work, ignore_errors=True)

if __name__ == "__main__":
    main()
