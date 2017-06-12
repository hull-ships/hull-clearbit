
# Hull Clearbit Ship.

Enrich customer profiles using [Clearbit](https://clearbit.com)

If you want your own instance: [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/hull-ships/hull-clearbit)

End-Users: [See Readme here](https://dashboard.hullapp.io/readme?url=https://hull-clearbit.herokuapp.com)
---

### Using :

- Go to your `Hull Dashboard > Ships > Add new`
- Paste the URL for your Heroku deployment, or use ours : `https://hull-clearbit.herokuapp.com/`
- Enter the Clearbit API Key
- Go to Clearbit and save the following webhook url: `https://hull-clearbit.herokuapp.com/clearbit`

### Developing :

- Fork
- Install

```sh
npm install -g gulp
npm install
gulp
```

### Logs :

This are the log messages that are specific to the Clearbit connector :

- `discover.skip` : Logged when Clearbit Enrichment is skipped. The `reason` gives context on why it was skipped.
  params: `reason`, `email`, `id`, `external_id`, `domain`, `discover_segments`
  possible `reasons` :
  - `"discovering disabled"` : `Enable Discovery` is not checked in settings or the segment list to discover is empty.
  - `"no domain available"` : The user does not have a `clearbit/employment_domain` nor a `clearbit_company/domain`
  - `"already discoverd similar companies"`
  - `"never saw the guy - only discover real users"` : The user has never been seen or does not have an email defined.
  - `"already discovered"` : this user has been discovered by the Clearbit connector. Do not discover twice to avoid discovery loop.
  - `"user is not in discoverable segment"`
  - `"domain already used for discovery"` : do not use Clearbit discovery twice for the same domain.

- `prospect.skip` : Logged when Clearbit Prospection is skipped. The `reason` parameter gives context on why is was skipped.
  params: `reason`, `email`, `id`, `external_id`, `domain`, `prospect_segments`
  possible `reasons` :
  - `"no domain available"` : The user does not have a `clearbit/employment_domain` nor a `clearbit_company/domain`
  - `"prospecting disabled"` : `Enable Prospector` is not checked in settings or the segment list to prospect is empty.
  - `"known user - only prospect anonymous users"` : The user has an email defined.
  - `"already prospected"` : this user has already been prospected by the Clearbit connector. Do not prospect twice to avoid prospect loop.
  - `"we already have known users with that domain"`
