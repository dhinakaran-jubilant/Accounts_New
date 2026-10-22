#!/usr/bin/env python3
"""
SSL Certificate Generator for LoanDesk
Generates a self-signed SSL/TLS certificate (cert.pem) and private key (key.pem)
with SAN (Subject Alternative Names) for localhost, 127.0.0.1, hostname, and local network IP.
"""

import os
import sys
import socket
import ipaddress
import datetime
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def get_local_network_ip():
    """Detects primary local network IPv4 address."""
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

def generate_self_signed_cert(output_dir=None, cert_filename="cert.pem", key_filename="key.pem", days_valid=3650):
    if output_dir is None:
        output_dir = os.path.dirname(os.path.abspath(__file__))

    cert_path = os.path.join(output_dir, cert_filename)
    key_path = os.path.join(output_dir, key_filename)

    # 1. Generate 2048-bit RSA private key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )

    # 2. Build Subject and Issuer
    hostname = socket.gethostname()
    local_ip = get_local_network_ip()

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Tamil Nadu"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Chennai"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Jubilant Group"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "LoanDesk"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    # 3. Subject Alternative Names (SAN)
    san_list = [
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]

    if hostname and hostname.lower() != "localhost":
        try:
            san_list.append(x509.DNSName(hostname))
        except Exception:
            pass

    if local_ip and local_ip not in ("127.0.0.1", "0.0.0.0"):
        try:
            san_list.append(x509.IPAddress(ipaddress.IPv4Address(local_ip)))
        except Exception:
            pass

    now = datetime.datetime.now(datetime.timezone.utc)
    # Start 1 day before to avoid timezone skew issues
    valid_from = now - datetime.timedelta(days=1)
    valid_to = now + datetime.timedelta(days=days_valid)

    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(valid_from)
        .not_valid_after(valid_to)
        .add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False
        )
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False
            ),
            critical=True
        )
        .add_extension(
            x509.ExtendedKeyUsage([
                ExtendedKeyUsageOID.SERVER_AUTH,
                ExtendedKeyUsageOID.CLIENT_AUTH
            ]),
            critical=False
        )
    )

    cert = builder.sign(key, hashes.SHA256())

    # Write private key
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))

    # Write certificate
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"Generated SSL certificate successfully:")
    print(f"  - Certificate: {cert_path}")
    print(f"  - Private Key: {key_path}")
    print(f"  - Valid for:   {days_valid} days (until {valid_to.strftime('%Y-%m-%d')})")
    print(f"  - Common Name: localhost")
    print(f"  - SANs:        localhost, 127.0.0.1, {hostname}, {local_ip}")

    return cert_path, key_path

if __name__ == "__main__":
    generate_self_signed_cert()
