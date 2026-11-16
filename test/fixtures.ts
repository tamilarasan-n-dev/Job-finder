// Trimmed samples in the shape each public API returns.
const recent = "2026-11-15T09:30:00Z";

export const greenhouse = {
  jobs: [
    {
      id: 7001,
      title: "Software Engineer I, Full Stack",
      updated_at: recent,
      first_published: recent,
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/7001",
      location: { name: "Bengaluru, Karnataka, India" },
      departments: [{ name: "Engineering" }],
      offices: [{ name: "Bangalore", location: "Bengaluru, Karnataka, India" }],
      content:
        "&lt;p&gt;Build product with &lt;strong&gt;React&lt;/strong&gt;, Node.js &amp;amp; PostgreSQL.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;1-3 years of experience&lt;/li&gt;&lt;li&gt;Redis a plus&lt;/li&gt;&lt;/ul&gt;",
    },
    {
      id: 7002,
      title: "Senior Backend Engineer",
      updated_at: recent,
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/7002",
      location: { name: "Remote - India" },
      content: "&lt;p&gt;6+ years of experience&lt;/p&gt;",
    },
    {
      id: 7003,
      title: "Backend Engineer",
      updated_at: recent,
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/7003",
      location: { name: "San Francisco, CA" },
      content: "&lt;p&gt;Node.js&lt;/p&gt;",
    },
  ],
  meta: { total: 3 },
};

export const lever = [
  {
    id: "a1b2c3",
    text: "Backend Developer - Node.js",
    hostedUrl: "https://jobs.lever.co/beta/a1b2c3",
    createdAt: Date.parse(recent),
    workplaceType: "remote",
    country: "IN",
    categories: { location: "India", team: "Engineering", commitment: "Full-time", allLocations: ["India"] },
    descriptionPlain: "You will build APIs with Node.js, Express and MongoDB.",
    lists: [{ text: "Requirements", content: "<li>0-2 years of experience</li><li>Redis, Docker</li>" }],
    additionalPlain: "",
  },
  {
    id: "d4e5f6",
    text: "Product Designer",
    hostedUrl: "https://jobs.lever.co/beta/d4e5f6",
    createdAt: Date.parse(recent),
    workplaceType: "onsite",
    categories: { location: "Mumbai" },
    descriptionPlain: "Figma",
  },
];

export const ashby = {
  apiVersion: "1",
  jobs: [
    {
      id: "ash-1",
      title: "Frontend Engineer (React / Next.js)",
      location: "Chennai",
      secondaryLocations: [{ location: "Bengaluru" }],
      address: { postalAddress: { addressLocality: "Chennai", addressCountry: "India" } },
      isRemote: false,
      isListed: true,
      publishedAt: recent,
      jobUrl: "https://jobs.ashbyhq.com/gamma/ash-1",
      department: "Engineering",
      descriptionPlain: "Next.js, TypeScript, Tailwind. 1+ years of experience.",
    },
    {
      id: "ash-2",
      title: "Full Stack Engineer",
      location: "Remote",
      isRemote: true,
      isListed: false,
      publishedAt: recent,
      jobUrl: "https://jobs.ashbyhq.com/gamma/ash-2",
      descriptionPlain: "",
    },
  ],
};

export const smartrecruiters = {
  offset: 0,
  limit: 100,
  totalFound: 2,
  content: [
    {
      id: "744000111",
      name: "Software Developer - MERN",
      releasedDate: recent,
      location: { city: "Chennai", region: "TN", country: "in", remote: false },
      department: { label: "Engineering" },
      company: { identifier: "Delta1", name: "Delta" },
    },
    {
      id: "744000222",
      name: "Sales Manager",
      releasedDate: recent,
      location: { city: "Pune", country: "in" },
      company: { identifier: "Delta1", name: "Delta" },
    },
  ],
};

export const workable = {
  name: "Epsilon",
  jobs: [
    {
      title: "Full Stack Developer",
      shortcode: "ABC123",
      url: "https://apply.workable.com/j/ABC123",
      city: "Noida",
      country: "India",
      telecommuting: false,
      published_on: "2026-11-14",
      locations: [{ city: "Noida", region: "Uttar Pradesh", country: "India" }],
    },
  ],
};

export const remotive = {
  jobs: [
    {
      id: 991,
      url: "https://remotive.com/remote-jobs/software-dev/node-dev-991",
      title: "Node.js Developer",
      company_name: "Zeta Remote",
      candidate_required_location: "India",
      publication_date: "2026-11-15T10:00:00",
      description: "<p>Node.js, PostgreSQL, 1-3 years of experience</p>",
    },
    {
      id: 992,
      url: "https://remotive.com/remote-jobs/software-dev/fs-992",
      title: "Full Stack Engineer",
      company_name: "USA Only Inc",
      candidate_required_location: "USA",
      publication_date: "2026-11-15T10:00:00",
      description: "<p>React</p>",
    },
  ],
};

export const remoteok = [
  { legal: "API terms…" },
  {
    id: "123",
    slug: "remote-full-stack-123",
    position: "Full Stack Developer",
    company: "Eta",
    location: "Worldwide",
    date: recent,
    url: "https://remoteok.com/remote-jobs/123",
    description: "React Node",
    tags: ["react", "node"],
  },
];

export const wwrXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>WWR</title>
<item>
  <title>Theta Co: Backend Developer</title>
  <region>Anywhere in the World</region>
  <link>https://weworkremotely.com/remote-jobs/theta-co-backend-developer</link>
  <guid>https://weworkremotely.com/remote-jobs/theta-co-backend-developer</guid>
  <pubDate>Sat, 15 Nov 2026 08:00:00 +0000</pubDate>
  <description>&lt;p&gt;Node.js &amp;amp; Postgres&lt;/p&gt;</description>
</item>
<item>
  <title>Iota: Full-Stack Engineer (India)</title>
  <region>India</region>
  <link>https://weworkremotely.com/remote-jobs/iota-full-stack</link>
  <guid>https://weworkremotely.com/remote-jobs/iota-full-stack</guid>
  <pubDate>Sat, 15 Nov 2026 08:00:00 +0000</pubDate>
  <description>&lt;p&gt;React, Node.js, PostgreSQL&lt;/p&gt;</description>
</item>
</channel></rss>`;
