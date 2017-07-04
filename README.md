
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

  Logs that are specific for Clearbit Connector :
    - `incoming.user.start` - when started to saving user to clearbit
    - `clearbit.prospector.success` - when fetching clearbit prospects
