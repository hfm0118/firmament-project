# Flask Live Transcription Starter

Get started using Deepgram's Live Transcription with this Flask demo app.

## What is Deepgram?

[Deepgram's](https://deepgram.com/) voice AI platform provides APIs for speech-to-text, text-to-speech, and full speech-to-speech voice agents. Over 200,000+ developers use Deepgram to build voice AI products and features.

## Sign-up to Deepgram

Before you start, it's essential to generate a Deepgram API key to use in this project. [Sign-up now for Deepgram and create an API key](https://console.deepgram.com/signup?jump=keys).

## Quickstart

### Manual

Follow these steps to get started with this starter application.

#### Clone the repository

Go to GitHub and clone the repository:

```bash
git clone https://github.com/deepgram-starters/live-flask-starter.git
cd live-flask-starter
```

#### Install dependencies

Install the project dependencies.

```bash
pip install -r requirements.txt
```

#### Edit the config file

Copy the code from `sample.env` and create a new file called `.env`. Paste in the code and enter your API key you generated in the [Deepgram console](https://console.deepgram.com/).

```
DEEPGRAM_API_KEY=%api_key%
```

#### Run the application

##### Option 1: Using run_app.bat (Windows)

For Windows users, you can simply double-click or run the `run_app.bat` file to start both servers at once:

```bash
run_app.bat
```

##### Option 2: Manual startup

You need to run both app.py and app_socketio.py in separate terminal windows:

Terminal 1 (Flask server on port 8000):
```bash
python app.py
```

Terminal 2 (SocketIO server on port 5001):
```bash
python app_socketio.py
```

Once both servers are running, access the application in your browser at http://127.0.0.1:8000

## Testing

To contribute or modify pytest code, install the following dependencies:

```bash
pip install -r requirements-dev.txt
```

To run the tests, run the following command:

```bash
pytest -v -s
```

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Security Policy](./SECURITY.md) details the procedure for contacting Deepgram.

## Getting Help

We love to hear from you so if you have questions, comments or find a bug in the project, let us know! You can either:

- [Open an issue in this repository](https://github.com/deepgram-starters/live-flask-starter/issues/new)
- [Join the Deepgram Github Discussions Community](https://github.com/orgs/deepgram/discussions)
- [Join the Deepgram Discord Community](https://discord.gg/xWRaCDBtW4)

## Author

[Deepgram](https://deepgram.com)

## License

This project is licensed under the MIT license. See the [LICENSE](./LICENSE) file for more info.
