import React, { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css';
import { withAuthenticator } from '@aws-amplify/ui-react';
import { API, Auth, withSSRContext, graphqlOperation } from 'aws-amplify';
import { listMessages } from '../graphql/queries';
import { createMessage } from '../graphql/mutations';
import Message from '../components/message';
import { onCreateMessage } from '../graphql/subscriptions';

function Home({ messages }) {
  const [stateMessages, setStateMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [user, setUser] = useState(null);
  const [initialMessagesLoaded, setInitialMessagesLoaded] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const amplifyUser = await Auth.currentAuthenticatedUser();
        setUser(amplifyUser);
      } catch (err) {
        setUser(null);
      }
    };

    fetchUser();

    //Subscribe to creation of message
    const subscription = API.graphql(
      graphqlOperation(onCreateMessage)
    ).subscribe({
      next: ({ provider, value }) => {
        const newMessage = value.data.onCreateMessage;
        // Verifique se a nova mensagem já existe na lista
        if (!stateMessages.some((existingMessage) => existingMessage.id === newMessage.id)) {
          setStateMessages((stateMessages) => [
            ...stateMessages,
            newMessage,
          ]);
        }
      },
      error: (error) => console.warn(error),
    });

    // Carregue as mensagens iniciais apenas uma vez
    if (!initialMessagesLoaded) {
      getInitialMessages();
      setInitialMessagesLoaded(true);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getInitialMessages = async () => {
    try {
      const messagesReq = await API.graphql({
        query: listMessages,
        authMode: "AMAZON_COGNITO_USER_POOLS",
      });
      const newMessages = messagesReq.data.listMessages.items;
      setStateMessages(newMessages);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    async function getMessages() {
      try {
        const messagesReq = await API.graphql({
          query: listMessages,
          authMode: "AMAZON_COGNITO_USER_POOLS",
        });
        const newMessages = messagesReq.data.listMessages.items;
        newMessages.forEach((newMessage) => {
          if (!stateMessages.some((message) => message.id === newMessage.id)) {
            setStateMessages((prevMessages) => [...prevMessages, newMessage]);
          }
        });
      } catch (error) {
        console.error(error);
      }
    }
    getMessages();
  }, [user]);

  const handleSubmit = async (event) => {
    // Prevent the page from reloading
    event.preventDefault();

    // clear the textbox
    setMessageText("");

    const input = {
      // id is auto populated by AWS Amplify
      message: messageText, // the message content the user submitted (from state)
      owner: user.username, // this is the username of the current user
    };

    // Try make the mutation to graphql API
    try {
      await API.graphql({
        authMode: "AMAZON_COGNITO_USER_POOLS",
        query: createMessage,
        variables: {
          input: input,
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (user) {
    return (
      <div className={styles.background}>
        <div className={styles.container}>
          <h1 className={styles.title}> AWS Amplify Live Chat</h1>
          <div className={styles.chatbox}>
            {stateMessages
              // sort messages oldest to newest client-side
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((message) => (
                // map each message into the message component with message as props
                <Message
                  message={message}
                  user={user}
                  isMe={user.username === message.owner}
                  key={message.id}
                />
              ))}
          </div>
          <div className={styles.formContainer}>
            <form onSubmit={handleSubmit} className={styles.formBase}>
              <input
                type="text"
                id="message"
                name="message"
                autoFocus
                required
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="💬 Send a message to the world 🌎"
                className={styles.textBox}
              />
              <button style={{ marginLeft: "8px" }}>Send</button>
            </form>
          </div>
        </div>
      </div>
    );
  } else {
    return <p>Loading...</p>;
  }
}

export default withAuthenticator(Home);

export async function getServerSideProps({ req }) {
  // wrap the request in a withSSRContext to use Amplify functionality serverside.
  const SSR = withSSRContext({ req });

  try {
    // currentAuthenticatedUser() will throw an error if the user is not signed in.
    const user = await SSR.Auth.currentAuthenticatedUser();

    // If we make it passed the above line, that means the user is signed in.
    const response = await SSR.API.graphql({
      query: listMessages,
      // use authMode: AMAZON_COGNITO_USER_POOLS to make a request on the current user's behalf
      authMode: "AMAZON_COGNITO_USER_POOLS",
    });

    // return all the messages from the dynamoDB
    return {
      props: {
        messages: response.data.listMessages.items,
      },
    };
  } catch (error) {
    // We will end up here if there is no user signed in.
    // We'll just return a list of empty messages.
    return {
      props: {
        messages: [],
      },
    };
  }
}
