export interface MockTopic {
  id: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl: string;
}

export interface MockArticle {
  id: string;
  topicId: string;
  title: string;
  author: string;
  excerpt: string;
}

export const MOCK_TOPICS: MockTopic[] = [
  {
    id: "corruption-abuse-of-power",
    title: "Corruption and Abuse of Power",
    description: "Investigations into procurement rigging, bribery networks, nepotism, and election-era cash influence.",
    tags: ["corruption", "governance", "accountability"],
    imageUrl: "https://picsum.photos/seed/corruption/1200/700",
  },
  {
    id: "police-security-surveillance",
    title: "Police, Security Forces, and Surveillance",
    description: "Arbitrary stops, abuse patterns, mass surveillance, and barriers to accountability.",
    tags: ["policing", "surveillance", "civil-liberties"],
    imageUrl: "https://picsum.photos/seed/police/1200/700",
  },
  {
    id: "elections-opposition-protest",
    title: "Elections, Opposition, and Protest",
    description: "Coercion tactics, candidate disqualification, protest retaliation, and campaign disruption.",
    tags: ["elections", "rights", "protest"],
    imageUrl: "https://picsum.photos/seed/elections/1200/700",
  },
  {
    id: "corporate-labor-economic-injustice",
    title: "Corporate Power, Labor, and Economic Injustice",
    description: "Worker exploitation, unsafe industrial practices, sham representation, and subsidy inequities.",
    tags: ["labor", "industry", "inequality"],
    imageUrl: "https://picsum.photos/seed/labor/1200/700",
  },
  {
    id: "marginalized-discrimination",
    title: "Marginalized Communities and Discrimination",
    description: "Exclusion from policy, daily segregation, under-prosecuted hate incidents, and forced displacement.",
    tags: ["discrimination", "rights", "inclusion"],
    imageUrl: "https://picsum.photos/seed/marginalized/1200/700",
  },
  {
    id: "gender-sexuality-autonomy",
    title: "Gender, Sexuality, and Body Autonomy",
    description: "Survivor justice gaps, anti-LGBTQ+ workplace bias, and barriers to care and consent.",
    tags: ["gender", "lgbtq+", "autonomy"],
    imageUrl: "https://picsum.photos/seed/gender/1200/700",
  },
  {
    id: "environment-land-indigenous-rights",
    title: "Environment, Land, and Indigenous Rights",
    description: "Illegal extraction, forced relocations, polluted ecosystems, and attacks on environmental defenders.",
    tags: ["environment", "land", "indigenous"],
    imageUrl: "https://picsum.photos/seed/environment/1200/700",
  },
  {
    id: "digital-rights-censorship-control",
    title: "Digital Rights, Censorship, and Information Control",
    description: "Content suppression, speech criminalization, ISP surveillance, and online dissent tactics.",
    tags: ["digital-rights", "censorship", "privacy"],
    imageUrl: "https://picsum.photos/seed/digital-rights/1200/700",
  },
];

export const MOCK_ARTICLES: MockArticle[] = [
  { id: "c1", topicId: "corruption-abuse-of-power", title: "Inside the Tender Room: How One Company Keeps Winning Every Government Contract", author: "Investigative Desk", excerpt: "An insider explains how procurement rules are quietly bent, from tailored bid specs to backroom meetings, letting the same politically connected firm win year after year." },
  { id: "c2", topicId: "corruption-abuse-of-power", title: "Cash in Envelopes: The Hidden Cost of Getting Anything Approved", author: "Field Reporter", excerpt: "Residents describe the informal 'fees' demanded by local officials for basic permits, mapping how everyday bribery prices poor families out of essential services." },
  { id: "c3", topicId: "corruption-abuse-of-power", title: "Family First: When Public Office Becomes a Private Business", author: "Policy Reporter", excerpt: "A deep dive into how one politician channels jobs, contracts, and public funds toward relatives, turning a public mandate into a family empire." },
  { id: "c4", topicId: "corruption-abuse-of-power", title: "Whistleblower Speaks: The Penalty for Saying 'No' to the Boss", author: "Whistleblower Unit", excerpt: "A civil servant recounts how refusing to sign off on a suspicious payment led to demotion, harassment, and attempts to destroy their career." },
  { id: "c5", topicId: "corruption-abuse-of-power", title: "Audit Locked Away: The Report They Won't Let You See", author: "Data Team", excerpt: "Leaked excerpts from a shelved government audit reveal millions in unexplained spending and the internal fight to keep it out of public sight." },
  { id: "c6", topicId: "corruption-abuse-of-power", title: "Vote Buying 2.0: How Digital Wallets Are Used to Buy Elections", author: "Election Desk", excerpt: "Voters explain how campaign teams use mobile payments and e-vouchers to discreetly buy support while keeping transactions hard to trace." },

  { id: "p1", topicId: "police-security-surveillance", title: "Stopped and Searched: Life in a Neighborhood Under Permanent Suspicion", author: "Metro Reporter", excerpt: "Residents share daily stories of arbitrary stops, phone checks, and ID demands that never make it into official crime statistics." },
  { id: "p2", topicId: "police-security-surveillance", title: "Beaten but 'Resisting Arrest': What Really Happens Off Camera", author: "Justice Desk", excerpt: "Anonymous testimonies and medical records reveal a pattern of brutality later justified with boilerplate police statements." },
  { id: "p3", topicId: "police-security-surveillance", title: "Eyes in the Sky: How Street Cameras Follow You Home", author: "Tech Investigations", excerpt: "A technologist maps how a city's new camera network and facial recognition system can reconstruct a person's movements in chilling detail." },
  { id: "p4", topicId: "police-security-surveillance", title: "Protest Today, On a Watchlist Tomorrow", author: "Civil Liberties Team", excerpt: "Activists describe how attending a single rally leads to travel checks, home visits, and online monitoring long after the protests end." },
  { id: "p5", topicId: "police-security-surveillance", title: "When the Complaint Desk Is a Brick Wall", author: "Accountability Desk", excerpt: "Families who tried to file complaints against officers explain how cases are buried, from 'lost paperwork' to pressure to withdraw." },
  { id: "p6", topicId: "police-security-surveillance", title: "Private Chats, Public Evidence: When Your Messages Are No Longer Yours", author: "Digital Forensics Unit", excerpt: "A look at how law enforcement gains access to supposedly encrypted chats, and what that means for journalists, organizers, and ordinary users." },

  { id: "e1", topicId: "elections-opposition-protest", title: "The Village That 'Voted' 100%: Stories from a Perfect Election Result", author: "Election Observer", excerpt: "Locals recount pressure, coercion, and ballot stuffing behind turnout numbers that look flawless on paper." },
  { id: "e2", topicId: "elections-opposition-protest", title: "Banned from the Ballot: How Paperwork Becomes a Political Weapon", author: "Democracy Watch", excerpt: "Opposition candidates describe how minor technicalities are used to disqualify them before voters ever see their names." },
  { id: "e3", topicId: "elections-opposition-protest", title: "The Cost of Marching: Losing Jobs for Joining a Peaceful Protest", author: "Labor & Rights Desk", excerpt: "Workers share how employers, under pressure, quietly fire or sideline staff spotted at demonstrations." },
  { id: "e4", topicId: "elections-opposition-protest", title: "Muted Microphones: The Debate Questions They Wouldn't Allow", author: "Media Monitor", excerpt: "Journalists reveal the topics and questions banned from televised debates to keep controversial issues off-air." },
  { id: "e5", topicId: "elections-opposition-protest", title: "Ghost Voters: Families Who Find Their Dead Relatives Still 'Voting'", author: "Civic Data Lab", excerpt: "Citizens discover deceased family members appearing on voter rolls and even being recorded as having cast ballots." },
  { id: "e6", topicId: "elections-opposition-protest", title: "The Night Before the Vote: Sudden Raids on Opposition Offices", author: "Campaign Desk", excerpt: "Staffers recount coordinated searches, equipment seizures, and arrests that cripple campaigns right before election day." },

  { id: "l1", topicId: "corporate-labor-economic-injustice", title: "Life on a 14-Hour Shift: Inside the Factory That Never Sleeps", author: "Industry Desk", excerpt: "Workers describe unpaid overtime, impossible quotas, and the constant threat of replacement in a major export plant." },
  { id: "l2", topicId: "corporate-labor-economic-injustice", title: "Contract Today, Fired Tomorrow: The New Face of Job Insecurity", author: "Labor Investigations", excerpt: "Temporary and gig workers share how companies use short-term contracts to avoid benefits, unions, and accountability." },
  { id: "l3", topicId: "corporate-labor-economic-injustice", title: "Toxic Profits: The Company Dumping Waste Next to Your Home", author: "Environmental Desk", excerpt: "Residents track unexplained illnesses and dead fish downstream from an industrial plant that denies any wrongdoing." },
  { id: "l4", topicId: "corporate-labor-economic-injustice", title: "Union in Name Only: When Worker Representatives Answer to Management", author: "Workplace Rights Team", excerpt: "Employees explain how 'company unions' give a veneer of representation while shutting down real worker organizing." },
  { id: "l5", topicId: "corporate-labor-economic-injustice", title: "Company Town, Company Rules: Paying Rent to Your Employer", author: "Socioeconomic Desk", excerpt: "A look at how workers living in employer-owned housing face eviction threats when they speak up about unsafe conditions." },
  { id: "l6", topicId: "corporate-labor-economic-injustice", title: "Tax Breaks for Them, Austerity for You", author: "Public Finance Desk", excerpt: "An investigation into how generous subsidies and tax holidays for big firms coexist with cuts to schools and hospitals." },

  { id: "m1", topicId: "marginalized-discrimination", title: "Invisible in the Census, Invisible in Policy", author: "Inclusion Desk", excerpt: "Members of a minority group describe how being left out of official statistics means their needs are never funded or recognized." },
  { id: "m2", topicId: "marginalized-discrimination", title: "Denied at the Door: Everyday Segregation in Bars, Schools, and Housing", author: "Community Reporter", excerpt: "People share firsthand accounts of being turned away or overcharged based on ethnicity, religion, or appearance." },
  { id: "m3", topicId: "marginalized-discrimination", title: "When Hate Goes Unpunished: Abuses Labeled as 'Community Disputes'", author: "Justice & Equity Team", excerpt: "Victims of hate crimes explain how police downplay incidents and discourage them from pressing charges." },
  { id: "m4", topicId: "marginalized-discrimination", title: "Living Between Papers: The Reality of Stateless Families", author: "Human Rights Desk", excerpt: "Families without recognized citizenship talk about growing up unable to attend school, work legally, or access healthcare." },
  { id: "m5", topicId: "marginalized-discrimination", title: "From Joke to Threat: How Media Stereotypes Fuel Real-World Violence", author: "Media Impact Lab", excerpt: "Community leaders link 'harmless' portrayals in entertainment and news to harassment and attacks on the street." },
  { id: "m6", topicId: "marginalized-discrimination", title: "Forced to the Edge: How Development Pushes the Poor Out of the City", author: "Urban Rights Desk", excerpt: "Residents document being relocated from central neighborhoods to distant settlements with no jobs or services." },

  { id: "g1", topicId: "gender-sexuality-autonomy", title: "Reporting Sexual Assault in a System Built to Doubt You", author: "Gender Desk", excerpt: "Survivors describe humiliating police interrogations, victim-blaming, and years-long court delays that discourage others from coming forward." },
  { id: "g2", topicId: "gender-sexuality-autonomy", title: "The Hidden Cost of Being Out at Work", author: "Workplace Equality Team", excerpt: "LGBTQ+ employees recount subtle and open discrimination, from stalled promotions to office gossip that drives them out." },
  { id: "g3", topicId: "gender-sexuality-autonomy", title: "Banned Books, Silenced Bodies: When Schools Erase Sex Education", author: "Education Desk", excerpt: "Teachers and students explain how banning comprehensive sex education leads to misinformation and preventable harm." },
  { id: "g4", topicId: "gender-sexuality-autonomy", title: "Marriage or Nothing: Laws That Criminalize Love Outside Tradition", author: "Legal Affairs Desk", excerpt: "Couples share how laws and social norms punish relationships that do not fit approved gender roles or family structures." },
  { id: "g5", topicId: "gender-sexuality-autonomy", title: "Healthcare That Refuses You: Turning Trans Patients Away at the Door", author: "Health Access Desk", excerpt: "Transgender people describe being mocked, misgendered, or denied treatment altogether in public and private clinics." },
  { id: "g6", topicId: "gender-sexuality-autonomy", title: "Digital Shaming: How Intimate Images Become Weapons", author: "Online Harm Unit", excerpt: "Women and queer people explain the impact of non-consensual image sharing and the difficulty of getting authorities to act." },

  { id: "n1", topicId: "environment-land-indigenous-rights", title: "The Forest That Vanished While the Map Stayed Green", author: "Climate & Land Desk", excerpt: "Villagers document how satellite images and on-the-ground photos tell different stories about illegal logging operations." },
  { id: "n2", topicId: "environment-land-indigenous-rights", title: "Guardians of the River: Communities Fighting a Dam They Never Agreed To", author: "Indigenous Rights Desk", excerpt: "Indigenous leaders recount how projects are approved without genuine consultation, flooding ancestral lands." },
  { id: "n3", topicId: "environment-land-indigenous-rights", title: "When the Air Burns Your Throat: Living Next to an Industrial Zone", author: "Public Health Environment Desk", excerpt: "Residents track rising respiratory illnesses and mysterious odors, while official air quality readings remain 'normal.'" },
  { id: "n4", topicId: "environment-land-indigenous-rights", title: "Land Titles for the Powerful, Evictions for the Poor", author: "Land Justice Team", excerpt: "Farmers and informal settlers share how land titles suddenly appear in someone else's name just before eviction notices arrive." },
  { id: "n5", topicId: "environment-land-indigenous-rights", title: "The Price of Speaking for the Earth", author: "Defender Safety Desk", excerpt: "Environmental defenders describe threats, lawsuits, and attacks aimed at silencing opposition to profitable projects." },
  { id: "n6", topicId: "environment-land-indigenous-rights", title: "Mining Promises, Empty Pockets: Where the Resource Boom Never Reached the Locals", author: "Resource Accountability Unit", excerpt: "Local communities compare corporate promises of jobs and development with the reality of polluted water and few opportunities." },

  { id: "d1", topicId: "digital-rights-censorship-control", title: "The Posts That Disappear Overnight", author: "Platform Watch", excerpt: "Users track which kinds of posts get deleted or throttled on major platforms, revealing invisible lines of political censorship." },
  { id: "d2", topicId: "digital-rights-censorship-control", title: "Shadow-Banned: When Your Audience Vanishes Without Explanation", author: "Creator Rights Desk", excerpt: "Creators and activists share screenshots and data showing sudden drops in reach after posting on sensitive topics." },
  { id: "d3", topicId: "digital-rights-censorship-control", title: "The Law That Turns Criticism into 'Fake News'", author: "Digital Law Team", excerpt: "Lawyers explain how vaguely worded online speech laws are used to target journalists, bloggers, and ordinary citizens." },
  { id: "d4", topicId: "digital-rights-censorship-control", title: "Your ISP Knows: How Browsing Histories Become Political Files", author: "Privacy Lab", excerpt: "Digital rights advocates show how internet service providers can log and share user activity with authorities." },
  { id: "d5", topicId: "digital-rights-censorship-control", title: "VPNs, Code Words, and Memes: How People Talk When Everyone Is Watching", author: "Open Internet Desk", excerpt: "Netizens describe the creative tactics they use to bypass filters and avoid detection while discussing banned issues." },
  { id: "d6", topicId: "digital-rights-censorship-control", title: "From Comment Section to Courtroom", author: "Civic Speech Monitor", excerpt: "Ordinary users recount being summoned, questioned, or charged over critical comments left on news articles or official pages." },
];

export function getMockTopic(topicId: string) {
  return MOCK_TOPICS.find((topic) => topic.id === topicId) ?? null;
}

export function getMockArticlesByTopic(topicId: string) {
  return MOCK_ARTICLES.filter((article) => article.topicId === topicId);
}
