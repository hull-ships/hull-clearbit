This ship enriches customer profiles using [Clearbit](https://clearbit.com)

Fetch 3rd party data from Clearbit and writes it back into the customer profile.

# Setup

- Go to your [Clearbit dashboard, under API keys](https://dashboard.clearbit.com/keys). Copy the key, Paste it into your Hull Dashboard.
- Go to your [Clearbit Account Settings](https://dashboard.clearbit.com/account). Under Webhook URL, enter https://hull-clearbit.herokuapp.com/clearbit


## Similar Lead discovery

The lead discovery feature uses [Clearbit Discovery](https://clearbit.com/discovery) and [Clearbit Prospector](https://clearbit.com/prospector) to find new leads based your existing users.

Whenever a new user enters a segment that has been enabled in the "Similar lead discovery" section, this ship will :

1. Look for companies that are similar to the user's company via [Clearbit's Discovery](https://clearbit.com/discovery)
2. Then for each Company found, we look for Prospect that match a specified role and/or seniority within that Company, via [Clearbit's Prospector](https://clearbit.com/prospector)
3. For each Prospect found, we create a new User on your organization with the "Cleabit > Prospected at" attribute set to the current date.
