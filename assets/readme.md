# Hull ♥ Clearbit

[Clearbit](https://clearbit.com) is data provider for B2B for customers to query for companies and employees at companies.

#### Clearbit data includes:

- Individual identities (name, email, company, location…)
- Company identities (name, location, employees, revenues, technologies…)

#### Enrich contact data in all your tools with Clearbit data through Hull

With Hull, you can query Clearbit and use their data to enrich profiles in other tools using four of their products:

- [**Enrichment**](https://clearbit.com/enrichment): Look-up person and company data using emails and domains. This is added to contact profiles in Hull.
- [**Reveal**](https://clearbit.com/reveal): Turn anonymous traffic into company data. This creates contact profiles in Hull with a temporary non-email address identifier
- [**Discovery**](https://clearbit.com/discovery): Search our database of millions of companies to find leads.
- [**Prospector**](https://clearbit.com/prospector): Find contacts at a given company and their email address. This creates contact profiles in Hull, complete with their name, title and email address.

Hull’s Clearbit integration can also use these APIs alone, or in combination:

1. Turn anonymous traffic into company data with Clearbit Reveal
2. Find contacts at that company and their email address with Clearbit Prospector
3. Gather all known data on those contacts with Clearbit Enrichment.

Hull can then send those enriched profiles to other services including:

- Salesforce
- HubSpot
- Intercom
- Facebook Custom Audiences

Hull can also use that data to add contacts to segments - instance using job title data from Clearbit to create a segment of “CEOs”. That segment can then be shared with:

- HubSpot
- Optimizely
- Slack (trigger a notification)
- Facebook Custom Audiences

Hull also gives you more flexibility with your data from Clearbit. It enables you to sort, segment, score and combine data from multiple sources and send it straight to the tools they’re needed in a useful format.

- No APIs to tap into
- No code needed
- No import/export	
- No complexity
- No repetitive workflow creation



# Setup

- Go to your [Clearbit dashboard, under API keys](https://dashboard.clearbit.com/keys). Copy the key, Paste it into your Hull Dashboard.
- Go to your [Clearbit Account Settings](https://dashboard.clearbit.com/account). Under Webhook URL, enter https://hull-clearbit.herokuapp.com/clearbit


## Similar Lead discovery

The lead discovery feature uses [Clearbit Discovery](https://clearbit.com/discovery) and [Clearbit Prospector](https://clearbit.com/prospector) to find new leads based your existing users.

Whenever a new user enters a segment that has been enabled in the "Similar lead discovery" section, this ship will :

1. Look for companies that are similar to the user's company via [Clearbit's Discovery](https://clearbit.com/discovery)
2. Then for each Company found, we look for Prospect that match a specified role and/or seniority within that Company, via [Clearbit's Prospector](https://clearbit.com/prospector)
3. For each Prospect found, we create a new User on your organization with the "Cleabit > Prospected at" attribute set to the current date.
