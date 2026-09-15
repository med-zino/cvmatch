// Target job titles and city for the feed, from the sign-up form or the feed page.
// Each title costs JSearch requests on every feed refresh, so a few are kept.
const MAX_TITLES = 3;

const tidy = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);

function cleanPreferences({ titles, location } = {}) {
    const list = (Array.isArray(titles) ? titles : String(titles || '').split(',')).map(tidy).filter(Boolean);
    // Case-insensitive duplicates keep their first spelling
    const unique = [];
    list.forEach(title => {
        if (!unique.some(kept => kept.toLowerCase() === title.toLowerCase())) unique.push(title);
    });
    return { targetTitles: unique.slice(0, MAX_TITLES), targetLocation: tidy(location) };
}

module.exports = { cleanPreferences, MAX_TITLES };
