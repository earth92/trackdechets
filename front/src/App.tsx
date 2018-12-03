import ApolloClient from "apollo-boost";
import React, { Component } from "react";
import { ApolloProvider } from "react-apollo";
import { BrowserRouter as Router, Route } from "react-router-dom";
import "./App.css";
import Dashboard from "./dashboard/Dashboard";
import FormIntro from "./form/FormIntro";
import Home from "./Home";
import Login from "./login/Login";
import Signup from "./login/Signup";

const client = new ApolloClient({
  uri: "http://localhost:4000"
});

class App extends Component {
  render() {
    return (
      <ApolloProvider client={client}>
        <Router>
          <div className="App">
            <Route exact path="/" component={Home} />
            <Route exact path="/login" component={Login} />
            <Route exact path="/signup" component={Signup} />
            <Route path="/form" component={FormIntro} />
            <Route path="/dashboard" component={Dashboard} />
          </div>
        </Router>
      </ApolloProvider>
    );
  }
}

export default App;
