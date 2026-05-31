import re
import unicodedata

def slugify_backend(value):
    value = (value or '').lower()
    value = value.strip()
    value = ''.join(ch for ch in value if ch.isascii())
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

def slugify_for_url_backend(value):
    value = (value or '').lower().strip()
    value = unicodedata.normalize('NFD', value)
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    value = re.sub(r'[^a-z0-9\s-]', '', value)
    value = re.sub(r'\s+', '-', value)
    value = re.sub(r'-+', '-', value)
    return value.strip('-')

# Sample channel names that might cause issues
test_names = [
    "TF1",
    "France 2",
    "M6",
    "Canal+",
    "13ème rue",
    "Automoto la chaine",
    "Disney Channel +1",
    "RMC Découverte",
    "BFM TV"
]

print(f"{'Original Name':<25} | {'slugify':<20} | {'slugify_for_url'}")
print("-" * 75)
for name in test_names:
    s1 = slugify_backend(name)
    s2 = slugify_for_url_backend(name)
    print(f"{name:<25} | {s1:<20} | {s2}")

# Let's check some specific channels from the database
check_list = [
    {"id": "bfm-tv", "name": "BFM TV"},
    {"id": "france-2", "name": "France 2"},
    {"id": "brftv", "name": "BRF TV"},
    {"id": "cartoon-network", "name": "Cartoon Network"}
]

print("\nChecking existing database IDs against logic:")
for item in check_list:
    s_url = slugify_for_url_backend(item['name'])
    match = "MATCH" if s_url == item['id'] else f"MISMATCH (expected {s_url})"
    print(f"  Name: {item['name']:<20} | DB ID: {item['id']:<20} | Logic: {match}")
