import re

# Tiny alias → ISO-3166 alpha-2 map covering the common entries we see.
_COUNTRY_ALPHA2 = {
    "usa": "US", "us": "US", "united states": "US", "united states of america": "US",
    "uk": "GB", "u.k.": "GB", "united kingdom": "GB", "england": "GB",
    "india": "IN", "bharat": "IN",
    "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR",
    "spain": "ES", "italy": "IT", "netherlands": "NL", "brazil": "BR",
    "japan": "JP", "china": "CN", "singapore": "SG", "uae": "AE",
    "mexico": "MX", "south africa": "ZA", "ireland": "IE",
}

_US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
}


def _to_alpha2(token):
    if not token:
        return None
    t = token.strip()
    if len(t) == 2 and t.isalpha():
        return t.upper()
    return _COUNTRY_ALPHA2.get(t.lower())


def normalize_location(value):
    """Parse "City, Region, Country" (any subset) into a structured dict."""
    if value is None:
        return None
    if isinstance(value, dict):
        city = value.get("city")
        region = value.get("region") or value.get("state")
        country = _to_alpha2(value.get("country")) or value.get("country")
        if not any([city, region, country]):
            return None
        return {"city": city, "region": region, "country": country}

    s = str(value).strip()
    if not s:
        return None
    parts = [p.strip() for p in re.split(r"\s*,\s*", s) if p.strip()]

    city = region = country = None
    if len(parts) == 1:
        only = parts[0]
        alpha = _to_alpha2(only)
        if alpha:
            country = alpha
        else:
            city = only
    elif len(parts) == 2:
        city = parts[0]
        # Two-letter tokens are ambiguous (e.g. "CA" = California or Canada).
        # Prefer the US-state interpretation when applicable.
        if parts[1].upper() in _US_STATES:
            region = parts[1].upper()
            country = "US"
        else:
            alpha = _to_alpha2(parts[1])
            if alpha:
                country = alpha
            else:
                region = parts[1]
    else:
        city = parts[0]
        region = parts[1]
        country = _to_alpha2(parts[-1]) or parts[-1]
        if region.upper() in _US_STATES and not country:
            country = "US"

    return {"city": city, "region": region, "country": country}
