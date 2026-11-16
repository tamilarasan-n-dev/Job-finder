import type { LocationClass } from "./types.js";

// Indian cities / states commonly seen on job boards. Word-bounded so
// "Indiana" / "Indianapolis" don't count as India.
const INDIA = new RegExp(
  "\\b(" +
    [
      "india",
      "bharat",
      "bengaluru",
      "bangalore",
      "chennai",
      "madras",
      "hyderabad",
      "secunderabad",
      "pune",
      "mumbai",
      "bombay",
      "navi mumbai",
      "thane",
      "new delhi",
      "delhi",
      "ncr",
      "gurugram",
      "gurgaon",
      "noida",
      "greater noida",
      "faridabad",
      "kolkata",
      "calcutta",
      "kochi",
      "cochin",
      "trivandrum",
      "thiruvananthapuram",
      "coimbatore",
      "madurai",
      "tiruchirappalli",
      "trichy",
      "ahmedabad",
      "gandhinagar",
      "jaipur",
      "indore",
      "bhopal",
      "chandigarh",
      "mohali",
      "mysore",
      "mysuru",
      "mangalore",
      "mangaluru",
      "vizag",
      "visakhapatnam",
      "vijayawada",
      "nagpur",
      "lucknow",
      "bhubaneswar",
      "goa",
      "karnataka",
      "tamil nadu",
      "telangana",
      "maharashtra",
      "kerala",
      "haryana",
      "gujarat",
      "andhra pradesh",
      "uttar pradesh",
      "west bengal",
    ].join("|") +
    ")\\b",
  "i",
);

// Country codes as they appear in some feeds: "IN", "IND", "Remote (IN)".
const INDIA_CODE = /(^|[\s(,·\-–/|])(IN|IND)($|[\s),·\-–/|])/;

const REMOTE = /\b(remote|work from home|wfh|anywhere|distributed|virtual)\b/i;
const ASIA = /\b(apac|asia|asia[\s-]pacific|south asia|emea\s*\+?\s*apac)\b/i;

// "IN" is also the US state code for Indiana ("Indianapolis, IN, US").
const US = /\b(US|USA|U\.S\.A?\.?|United States)\b/;

export function mentionsIndia(location: string): boolean {
  if (INDIA.test(location)) return true;
  return INDIA_CODE.test(location) && !US.test(location);
}

/**
 * Classify a job's location.
 * - "india-onsite": an Indian city/state/country is named and it isn't remote.
 * - "remote-india": remote AND India named (or APAC/Asia when allowAsia).
 * - "other": everything else, including worldwide-remote with no country.
 */
export function classifyLocation(location: string, remoteFlag: boolean, opts: { allowAsia: boolean }): LocationClass {
  const loc = location || "";
  const india = mentionsIndia(loc);
  const remote = remoteFlag || REMOTE.test(loc);
  if (remote) {
    if (india) return "remote-india";
    if (opts.allowAsia && ASIA.test(loc)) return "remote-india";
    return "other";
  }
  return india ? "india-onsite" : "other";
}
