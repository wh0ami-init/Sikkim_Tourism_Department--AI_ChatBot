# Sikkim Tourism Assistant — Local Evaluation Report

- Run at: 2026-08-23T15:10:59.347011+00:00
- Backend: `http://localhost:8000`
- Prompt groups: permits_and_fees, roads_and_notices, travel_agencies, events

## Permits And Fees

### 1. Visitor prompt

Do I need a permit for Nathula Pass?

**Review point:** Does not invent permit approval rules or current availability.

**Assistant response:**

**Nathu La Pass**
- Permit: Protected Area Permit (PAP) required for foreign nationals. Indian nationals need an Inner Line Permit (ILP) obtainable from Gangtok tourism offices. Maximum 800 Indian + 50 foreign tourists per day. Advance booking recommended.
- Entry fee: ₹200 per person (Indian nationals); ₹1,000 (foreign nationals)

Source: Department destination catalogue. Permit rules, access, and fees can change; confirm before travel.

### 2. Visitor prompt

Can a foreign tourist visit Gurudongmar Lake?

**Review point:** Flags restrictions and directs the visitor to the correct authority.

**Assistant response:**

**Gurudongmar Lake**
- Permit: Restricted Area Permit (RAP) required. Obtainable via registered tour operators or District Collector's office, Mangan. Foreign nationals NOT permitted.
- Entry fee: ₹100 per person

Source: Department destination catalogue. Permit rules, access, and fees can change; confirm before travel.

### 3. Visitor prompt

What is the entry fee for Rumtek Monastery?

**Review point:** Uses an official record or states that a verified current fee is unavailable.

**Assistant response:**

I could not find a relevant official Sikkim Tourism page that confirms this current permit or fee. I will not use an unrelated page as evidence. Please confirm with the Tourism and Civil Aviation Department before travel.

### 4. Visitor prompt

Are permits required for Dzongri Trek?

**Review point:** Separates general travel guidance from a current permit decision.

**Assistant response:**

I found the following information on the official Sikkim Tourism website. Please confirm the current requirement from the linked page before travel.

**Protected Area Permit (PAP)**
West District 2 permit destinations Dzongri Trek Permit is issued by TIC Pelling and TIC Gangtok. must be 150 cc or higher to enter PAP areas.
Source: https://www.sikkimtourism.gov.in/pap

**TrekkingDetails - Sikkim Tourism**
Title: TrekkingDetails - Sikkim Tourism Forest and Environment Department, Government of Sikkim. # Goechala Trek. The biggest reason to do the Goechala trek is the grand views of big mountains that you see. That’s a lot for any trek — especially as close to the eyes as on the Goechala trek. It is no wonder that trekkers consider Goechala to be the closest to the big mountain treks of Nepal. One of the biggest highlights of the Goechala trek is the sunrise seen on the Kanchenjunga range. Even though trekkers are not allowed all the way to the actual Goecha Pass, the view from View Point 1 and Dzongri is worth an arm and a leg! The Samiti Lake is another big attraction on the Goechala trek. The view of the still waters, and the reflection of Mt Pandim in the lake, especially in the early hours, is a visual treat. #### **Foreigners on the Goechala trek**. Foreigners must reach Yuksom, the b
Source: https://sikkimtourism.gov.in/Public/ThingsToDo/TrekkingDetails/TK20A001?advTypeID=1

## Roads And Notices

### 1. Visitor prompt

Is the road to Nathula open today?

**Review point:** Uses a dated official advisory or clearly says no verified current record is available.

**Assistant response:**

I found these latest dated official records. I will not infer that a road is open or closed unless a record says so clearly.

- 2026-08-01: **01-08-2026**
  SIKKIM POLICE COMMUNICATIONS & COMPUTERS * GANGTOK * SIKKIM POLICE TO PROTECT & SERVE SIKKIM POLICE CONTROL ROOM, COMMUNICATIONS BRANCH CIRCULAR BUILDING, NEW TASHILING SECRETARIAT, GANGTOK ROAD SITUATION REPORT DATED- 01/08/2026 | DISTRICTS | STATUS | |---|---| | GANGTOK | ALL ROADS ARE CLEAR UNDER GANGTOK DISTRICT. |

Source: Official Tourism and Civil Aviation Department notices. Check the linked notice page before travel because road status can change quickly.

### 2. Visitor prompt

What is the latest road status in North Sikkim?

**Review point:** States advisory issue dates and avoids general-knowledge road claims.

**Assistant response:**

I found these latest dated official records. I will not infer that a road is open or closed unless a record says so clearly.

- 2026-08-01: **01-08-2026**
  SIKKIM POLICE COMMUNICATIONS & COMPUTERS * GANGTOK * SIKKIM POLICE TO PROTECT & SERVE SIKKIM POLICE CONTROL ROOM, COMMUNICATIONS BRANCH CIRCULAR BUILDING, NEW TASHILING SECRETARIAT, GANGTOK ROAD SITUATION REPORT DATED- 01/08/2026 | DISTRICTS | STATUS | |---|---| | GANGTOK | ALL ROADS ARE CLEAR UNDER GANGTOK DISTRICT. |

Source: Official Tourism and Civil Aviation Department notices. Check the linked notice page before travel because road status can change quickly.

### 3. Visitor prompt

Are there any recent cancellation orders?

**Review point:** Returns only official record information.

**Assistant response:**

There are **3** cancellation orders on file in the official department records.

The latest records are:

- 2026-08-19: **Cancellation Order 687/DoT&CAV** — [source](https://sikkimtourism.gov.in/assets/files/notice/687.pdf)
- 2026-08-19: **Cancellation Order 688/DoT&CAV** — [source](https://sikkimtourism.gov.in/assets/files/notice/688.pdf)
- 2026-08-19: **Cancellation Order 77/DoT&CAV** — [source](https://sikkimtourism.gov.in/assets/files/notice/01.pdf)

### 4. Visitor prompt

What about the road status on the 27th?

**Review point:** Uses the preceding road-status context for a natural follow-up.

**Assistant response:**

I found these latest dated official records. I will not infer that a road is open or closed unless a record says so clearly.

- 2026-08-01: **01-08-2026**
  SIKKIM POLICE COMMUNICATIONS & COMPUTERS * GANGTOK * SIKKIM POLICE TO PROTECT & SERVE SIKKIM POLICE CONTROL ROOM, COMMUNICATIONS BRANCH CIRCULAR BUILDING, NEW TASHILING SECRETARIAT, GANGTOK ROAD SITUATION REPORT DATED- 01/08/2026 | DISTRICTS | STATUS | |---|---| | GANGTOK | ALL ROADS ARE CLEAR UNDER GANGTOK DISTRICT. |

Source: Official Tourism and Civil Aviation Department notices. Check the linked notice page before travel because road status can change quickly.

## Travel Agencies

### 1. Visitor prompt

Give me full details on Denizen Tours and Travels.

**Review point:** Returns a verified directory record or an honest no-match response.

**Assistant response:**

**M/s Denizen T&T**
- Registration No.: 1542/DoT&Cav/E/23/TA
- Proprietor: Mr. Ashish Gurung
- District: Gangtok
- Contact: 8653878880
- Email / Website: thinkinside@gmail.com
- Address: Tadong, Daragoan, near greendale school, Gtk,Sikkim
- Date of Issue: 2023-04-13
- Renewed Upto: 2026-04-30

Source: Official department travel-agency directory (record synced 2026-08-07 UTC).

### 2. Visitor prompt

How many travel agencies are registered in Gangtok?

**Review point:** Reports the exact directory count, not a truncated search result.

**Assistant response:**

There are **1545** registered travel agencies in Gangtok in the official department directory.

Source: Official department travel-agency directory.

### 3. Visitor prompt

Can you recommend the best travel agency for Nathula?

**Review point:** Does not endorse or rank private businesses as the Department.

**Assistant response:**

The Department does not rank or endorse private travel agencies. You may verify a specific registered agency by name, and I can provide its official directory record when available.

### 4. Visitor prompt

I meant the first agency you listed.

**Review point:** Resolves a numbered shortlist only when one was actually offered.

**Assistant response:**

I could not find a matching travel agency in the official department directory, so I will not invent a registration number or contact details. Please check the spelling or give me the district it is registered in.

## Events

### 1. Visitor prompt

Are there any upcoming tourism events in Sikkim?

**Review point:** Must not invent an official-looking event calendar.

**Assistant response:**

I found the following official Sikkim Tourism information about festivals or events. It does not publish a dated schedule that confirms the period you asked about, so please treat this as background information rather than a current event calendar.

**FairsAndFestivals - Sikkim Tourism**
STDC (Sikkim Tourism Development Corporation). Sikkim (/ˈsɪkɪm/) is a state in northeastern India. Sikkim is the least populous and second smallest among the Indian states. After 1947, Sikkim continued its protectorate status with the Republic of India. A referendum in 1975 led to Sikkim joining India as its 22nd state. Modern Sikkim is a multiethnic and multilingual Indian state. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. One of the most famous and biggest festivals of Sikkim, Saga Dawa is celebrated with great enthusiasm and fervour every year. Cherry Tea Festival Sikkim Tourism. Pelling Winter Tourism Festival Sikkim Tourism. Pelling is one of the most famous tourist destinations in Sikkim and is popular as it offers breathtaking vistas of Mt. Khangchendzonga and o... *B*umchu festival is celebrated at Tashiding Monastery, West Sikkim on the 15th day o... Tendong Lho rum Faat Sikkim Tourism. It is celebrated by Lepchas, Takes place on Tendong Hill in South Sikkim and other parts of the state n The name, Tendong i
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/fairsandfestivals

**- Sikkim Tourism**
Tourism and Civil Aviation Department, Govt. Sikkim Darshan Payment Public Grievances. * IHCAE (Indian Himalayan Centre For Adventure & Eco-Tourism). * IHM (Institute of Hotel Management). SAATHI (System for Assessment, Awareness and Training for Hospitality Industry). NIDHI (National Integrated Database of Hospitality Industry). STDC (Sikkim Tourism Development Corporation). Forest and Environment Department, Government of Sikkim. Protected Area Permits (Foreign & Domestic Tourists). Restricted Area Permits (Foreign Tourists). **Service Providers:** Register your business here. Pang Lhabsol is celebrated to offer respect and homage to the third highest mountain, Mount Kanchenjunga. But this is not it, Pang means ‘*to witness’* and apart from paying homage it also commemorates the Treaty of brotherhood among Lepchas and Bhutias. It signifies the unity of the Sikkimese. Mount Kanchenjunga is also the highest mountain in India. It is considered as the guardian deity of Sikkim and it is said that the Sikkimese invoke God on this day on behalf of the entire country. The festival is consi
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivalDetails/FF20A071?type=Festival

### 2. Visitor prompt

Which festivals happen in 2027?

**Review point:** Requires a verified event record for future dates.

**Assistant response:**

I found the following official Sikkim Tourism information about festivals or events. It does not publish a dated schedule that confirms the period you asked about, so please treat this as background information rather than a current event calendar.

**FairsAndFestivals - Sikkim Tourism**
STDC (Sikkim Tourism Development Corporation). Sikkim (/ˈsɪkɪm/) is a state in northeastern India. Sikkim is the least populous and second smallest among the Indian states. After 1947, Sikkim continued its protectorate status with the Republic of India. A referendum in 1975 led to Sikkim joining India as its 22nd state. Modern Sikkim is a multiethnic and multilingual Indian state. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. One of the most famous and biggest festivals of Sikkim, Saga Dawa is celebrated with great enthusiasm and fervour every year. Cherry Tea Festival Sikkim Tourism. Pelling Winter Tourism Festival Sikkim Tourism. Pelling is one of the most famous tourist destinations in Sikkim and is popular as it offers breathtaking vistas of Mt. Khangchendzonga and o... *B*umchu festival is celebrated at Tashiding Monastery, West Sikkim on the 15th day o... Tendong Lho rum Faat Sikkim Tourism. It is celebrated by Lepchas, Takes place on Tendong Hill in South Sikkim and other parts of the state n The name, Tendong i
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/fairsandfestivals

**- Sikkim Tourism**
Tourism and Civil Aviation Department, Govt. Protected Area Permits (Foreign & Domestic Tourists). Restricted Area Permits (Foreign Tourists). Pang Lhabsol is celebrated to offer respect and homage to the third highest mountain, Mount Kanchenjunga. But this is not it, Pang means ‘*to witness’* and apart from paying homage it also commemorates the Treaty of brotherhood among Lepchas and Bhutias. It signifies the unity of the Sikkimese. Mount Kanchenjunga is also the highest mountain in India. It is considered as the guardian deity of Sikkim and it is said that the Sikkimese invoke God on this day on behalf of the entire country. The festival is considered very auspicious and happens in between August and September. Many tourists visit Sikkim just to watch this festival and you will find many locals cheering the dancers. The entire aura is vibrant with dancers twirling fiercely on the beat of the drums. It is such a positive feeling and marks the unity of people. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. It coincides
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivalDetails/FF20A071?type=Festival

### 3. Visitor prompt

When is the next Sikkim festival?

**Review point:** Does not infer a current schedule from general knowledge.

**Assistant response:**

I found the following official Sikkim Tourism information about festivals or events. It does not publish a dated schedule that confirms the period you asked about, so please treat this as background information rather than a current event calendar.

**FairsAndFestivals - Sikkim Tourism**
Sikkim (/ˈsɪkɪm/) is a state in northeastern India. Sikkim is also located close to India's Siliguri Corridor near Bangladesh. Sikkim is the least populous and second. After 1947, Sikkim continued its. A referendum in 1975 led to Sikkim joining India as its. Modern Sikkim is a multiethnic and multilingual Indian state. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. Pang Lhabsol is celebrated to offer respect and homage to the third highest mountain, Mount Kanchenjunga. One of the most famous and biggest festivals of Sikkim, Saga Dawa is celebrated with great enthusiasm and fervour every year. Pelling is one of the most famous tourist destinations in Sikkim and is popular as it offers breathtaking vistas of Mt. Khangchendzonga and o... *B*umchu festival is celebrated at Tashiding Monastery, West Sikkim on the 15th day o... It is celebrated by Lepchas, Takes place on Tendong Hill in South Sikkim and other parts of the state n The name, Tendong is derive... Indrajatra is an important religious festival celebrated with pomp
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivals

**- Sikkim Tourism**
Tourism and Civil Aviation Department, Govt. Sikkim Darshan Payment Public Grievances. * IHCAE (Indian Himalayan Centre For Adventure & Eco-Tourism). * IHM (Institute of Hotel Management). SAATHI (System for Assessment, Awareness and Training for Hospitality Industry). NIDHI (National Integrated Database of Hospitality Industry). STDC (Sikkim Tourism Development Corporation). Forest and Environment Department, Government of Sikkim. Protected Area Permits (Foreign & Domestic Tourists). Restricted Area Permits (Foreign Tourists). **Service Providers:** Register your business here. The festival of Loosong is mostly celebrated in the month of December every year with traditional gaiety and colour both by Lepchas and Bhutias. It marks the end of harvest season as also the closing of the Tibetan year. Several religious dances (known as Chaams) are performed mostly in the famous monasteries of all four districts to celebrate the victory of good over evil. Traditional archery competitions are also held at various places during the festival. Lossong celebrated all over Sikkim marks the end of
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivalDetails/FF20A088?type=Festival

### 4. Visitor prompt

Tell me about Pang Lhabsol.

**Review point:** May provide cultural background without presenting dates as current.

**Assistant response:**

I found the following official Sikkim Tourism information about festivals or events. It does not publish a dated schedule that confirms the period you asked about, so please treat this as background information rather than a current event calendar.

**- Sikkim Tourism**
Tourism and Civil Aviation Department, Govt. Protected Area Permits (Foreign & Domestic Tourists). Restricted Area Permits (Foreign Tourists). Pang Lhabsol is celebrated to offer respect and homage to the third highest mountain, Mount Kanchenjunga. But this is not it, Pang means ‘*to witness’* and apart from paying homage it also commemorates the Treaty of brotherhood among Lepchas and Bhutias. It signifies the unity of the Sikkimese. Mount Kanchenjunga is also the highest mountain in India. It is considered as the guardian deity of Sikkim and it is said that the Sikkimese invoke God on this day on behalf of the entire country. The festival is considered very auspicious and happens in between August and September. Many tourists visit Sikkim just to watch this festival and you will find many locals cheering the dancers. The entire aura is vibrant with dancers twirling fiercely on the beat of the drums. It is such a positive feeling and marks the unity of people. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. It coincides
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivalDetails/FF20A071?type=Festival

**- Sikkim Tourism**
Tourism and Civil Aviation Department, Govt. Sikkim Darshan Payment Public Grievances. * IHCAE (Indian Himalayan Centre For Adventure & Eco-Tourism). * IHM (Institute of Hotel Management). SAATHI (System for Assessment, Awareness and Training for Hospitality Industry). NIDHI (National Integrated Database of Hospitality Industry). STDC (Sikkim Tourism Development Corporation). Forest and Environment Department, Government of Sikkim. Protected Area Permits (Foreign & Domestic Tourists). Restricted Area Permits (Foreign Tourists). **Service Providers:** Register your business here. This festival celebrates Lord Buddha's first preaching of the Four Noble Truths to his first five disciples at Saranath. The festival is held on the 4th day of the 6th month of the Tibetan lunar calendar. This is the main festival of the Hindu Nepalese community of Sikkim celebrated usually in the month of October. It coincides and is celebrate... Pang Lhabsol is celebrated to offer respect and homage to the third highest mountain, Mount Kanchenjunga. But this is not it, Pang means &... One of the most famous
Source: https://sikkimtourism.gov.in/Public/ExperienceSikkim/FairsAndFestivalDetails/FF20A086?type=Festival
