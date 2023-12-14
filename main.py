import random
from flask import Flask, request
from flask_socketio import SocketIO, emit
import datetime
from flask_cors import CORS
import requests

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*')

connectedUserIds = {}

triviaSessionId = ['', datetime.datetime.now()]


game = {
    'users': {},
    'game_state': 'waiting',
    'question': None,
    'answers': [],
    'correct_answer': None,
    'buzzed_in': [],
    'answered': [],
    'show_answer': False,
    'show_question': False,
    'question_time': None,
    'connectedUserIds': connectedUserIds
}

InitGame = {
    'users': {},
    'game_state': 'waiting',
    'question': None,
    'answers': [],
    'correct_answer': None,
    'buzzed_in': [],
    'answered': [],
    'show_answer': False,
    'show_question': False,
    'question_time': None,
    'connectedUserIds': connectedUserIds
}


def resetTriviaSessionId():
    response = requests.get("https://opentdb.com/api_token.php?command=request")
    triviaSessionId[0] = response.json()['token']
    triviaSessionId[1] = datetime.datetime.now()

def getTriviaSessionId():
    current_time = datetime.datetime.now()
    minsDelta = current_time - triviaSessionId[1] 
    if (minsDelta.seconds > 15000 or triviaSessionId[0] == ''):
        resetTriviaSessionId()
    return triviaSessionId[0]

def getQuestion():

    catagories = ['9', '17', '18', '19', '20', '22', '23', '24']


    response = requests.get("https://opentdb.com/api.php?amount=1&category=" + catagories[random.randint(0, len(catagories) - 1)]
                             +"&type=multiple&token=" + getTriviaSessionId())
    print(response.json()) 
    if (response.json()['response_code'] != 0):
       return None
    question = response.json()['results'][0]
    game['question'] = question['question']
    if ("Which of these" in game['question']):
        game['question'] = game['question'].replace("Which of these", "What is the")
    if ("Which of the following" in game['question']):
        game['question'] = game['question'].replace("Which of the following", "What is the")
    
    game['answers'] = question['incorrect_answers'] + [question['correct_answer']]
    game['correct_answer'] = question['correct_answer']
    game['buzzed_in'] = []
    game['answered'] = []
    game['show_answer'] = False
    game['show_question'] = False
    game['question_time'] = datetime.datetime.now().strftime("%H:%M:%S")
    game['game_state'] = 'question'
    return question


@app.route('/')
def index():
    return 'Welcome to your Flask-SocketIO server!'

@socketio.on('connect')
def handle_connect():
    getTriviaSessionId()
    user_id = request.sid  # The session ID can be used as a unique identifier for the user
    connectedUserIds[user_id] = True
    emit('app update', game, broadcast=True)

@socketio.on('addName')
def handle_name(name):
    user_id = request.sid
    connectedUserIds[user_id] = name
    if (not name in game['users']):
        game['users'][name] = {
            'score': 0,
            'role': 'player'
        }
    emit('app update', game, broadcast=True)

@socketio.on('nextQuestion')
def handle_question(args):
    getQuestion()
    emit('app update', game, broadcast=True)

@socketio.on('buzz')
def handle_buzz(args):
    user_id = request.sid
    name = connectedUserIds[user_id]
    game['buzzed_in'].append([name,datetime.datetime.now().strftime("%H:%M:%S")]) 
    emit('app update', game, broadcast=True)

@socketio.on('answer')
def handle_answer(answer):
    user_id = request.sid
    name = connectedUserIds[user_id]
    game['answered'].append([name,answer,datetime.datetime.now().strftime("%H:%M:%S")]) 
    emit('app update', game, broadcast=True)

@socketio.on('showAnswer')
def handle_show_answer(args):
    game['show_answer'] = True
    emit('app update', game, broadcast=True)

@socketio.on('showQuestion')
def handle_show_question(args):
    game['show_question'] = True
    emit('app update', game, broadcast=True)

@socketio.on('addScore')
def handle_add_score(name):
    game['users'][name]['score'] += 1
    emit('app update', game, broadcast=True)

@socketio.on('removeScore')
def handle_remove_score(name):
    game['users'][name]['score'] -= 1
    emit('app update', game, broadcast=True)

@socketio.on('resetGame')
def handle_reset_game(args):
    users = game['users']
    game = InitGame
    game['users'] = users
    for user in game['users']:
        game['users'][user]['score'] = 0
    resetTriviaSessionId()
    emit('app update', game, broadcast=True)

@socketio.on('changeRole')
def handle_change_role(name):
    if (game['users'][name]['role'] == 'player'):
        game['users'][name]['role'] = 'presenter'
    else:
        game['users'][name]['role'] = 'player'
    emit('app update', game, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    user_id = request.sid
    del connectedUserIds[user_id]
    emit('app update', game, broadcast=True)



if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)
