#!/usr/bin/env python3
"""Independent verification of the built APK using androguard (third-party parser):
manifest decoding, resources lookup, dex parsing, and APK Signature Scheme v2 verification
(digest recomputation + RSA signature check)."""
import sys, hashlib, struct, warnings
warnings.filterwarnings("ignore")
from androguard.core.bytecodes.apk import APK
from androguard.core.bytecodes.dvm import DalvikVMFormat

path = sys.argv[1]
apk = APK(path)
ok = True
def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg)
    ok = ok and cond

print(apk.get_android_manifest_axml().get_xml().decode()[:2000])
check(apk.is_valid_APK(), "valid APK")
check(apk.get_package() == "com.warfront.dominion", "package name")
check(apk.get_main_activity() == "com.warfront.dominion.MainActivity", "main activity: %s" % apk.get_main_activity())
check(apk.get_min_sdk_version() == "24", "minSdk")
check(apk.get_target_sdk_version() == "33", "targetSdk")
check(apk.get_app_name() == "Warfront: Dominion", "app label: %r" % apk.get_app_name())
icon = apk.get_app_icon()
check(icon is not None and icon.endswith("ic_launcher.png") and icon in apk.get_files(), "launcher icon resolves via resources.arsc: %s" % icon)
res = apk.get_android_resources()
check(res is not None, "resources.arsc parses")
dvm = DalvikVMFormat(apk.get_dex())
names = [c.get_name() for c in dvm.get_classes()]
check("Lcom/warfront/dominion/MainActivity;" in names, "dex contains MainActivity")
check(any("NativeBridge" in n for n in names), "dex contains NativeBridge")
check(apk.is_signed_v2(), "APK Signature Scheme v2 block present")
check(apk.is_signed_v2() and len(apk.get_certificates_der_v2()) == 1, "v2 certificate extracted")

# Independent v2 digest + signature verification
data = open(path, "rb").read()
eocd = data.rfind(b"PK\x05\x06")
cd_off = struct.unpack("<I", data[eocd + 16:eocd + 20])[0]
magic = data[cd_off - 16:cd_off]
check(magic == b"APK Sig Block 42", "signing block magic")
bsize = struct.unpack("<Q", data[cd_off - 24:cd_off - 16])[0]
block_start = cd_off - bsize - 8
sections = [data[:block_start], data[cd_off:eocd], data[eocd:eocd + 16] + struct.pack("<I", block_start) + data[eocd + 20:]]
chunks = []
for s in sections:
    for i in range(0, len(s), 1 << 20):
        c = s[i:i + (1 << 20)]
        chunks.append(hashlib.sha256(b"\xa5" + struct.pack("<I", len(c)) + c).digest())
digest = hashlib.sha256(b"\x5a" + struct.pack("<I", len(chunks)) + b"".join(chunks)).digest()
# parse signer
p = block_start + 8
pair_len = struct.unpack("<Q", data[p:p + 8])[0]; pid = struct.unpack("<I", data[p + 8:p + 12])[0]
v = data[p + 12:p + 8 + pair_len]
def rd(b, o):
    n = struct.unpack("<I", b[o:o + 4])[0]; return b[o + 4:o + 4 + n], o + 4 + n
signers, _ = rd(v, 0); signer, _ = rd(signers, 0)
sd, o = rd(signer, 0); sigs, o = rd(signer, o); pub, o = rd(signer, o)
digs, _ = rd(sd, 0); d0, _ = rd(digs, 0); alg = struct.unpack("<I", d0[:4])[0]; dig, _ = rd(d0, 4)
check(pid == 0x7109871a, "v2 block id")
check(dig == digest, "v2 content digest matches recomputed digest")
from cryptography.hazmat.primitives.serialization import load_der_public_key
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
s0, _ = rd(sigs, 0); sig, _ = rd(s0, 4)
try:
    load_der_public_key(pub).verify(sig, sd, padding.PKCS1v15(), hashes.SHA256()); sv = True
except Exception as e:
    sv = False
check(sv, "v2 RSA signature verifies over signed-data")
# alignment of stored entries
import zipfile
zf = zipfile.ZipFile(path)
for zi in zf.infolist():
    if zi.compress_type == 0:
        lh = zi.header_offset
        nlen, xlen = struct.unpack("<HH", data[lh + 26:lh + 30])
        if (lh + 30 + nlen + xlen) % 4:
            check(False, "alignment of %s" % zi.filename)
check(zf.testzip() is None, "zip CRC integrity")
print("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
