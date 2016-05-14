import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { browserHistory } from 'react-router';
import { Header } from './index';
import actions from './../actions/ActionCreators';
import axios from 'axios';

const ROOT_URL = 'http://127.0.0.1:8000';

class AcceptedCompetitorCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      avatar: '',
      username: ''
    }
  }

  componentWillMount() {
    console.log(this.props.c)
    axios.get(`${ROOT_URL}/api/v1/users/${this.props.c.secondary_user_id}`)
      .then(response => {

        this.setState({
          avatar: response.data.avatar_url,
          username: response.data.username,
          userid: response.data.id
        })
      });
  }

  render() {
    return <div>
      { !!this.state.avatar ? 
          <div>
            <img className="user-avatar-med" src={this.state.avatar} />
            <h2 className="font-white">{this.state.username}</h2>
            <span>Confirmed Request!</span>
            <input onClick={(e) => {this.handleAccept(e, this.props.req)}} type="button" value="COMPETE!" />
          </div> : <div></div> }
    </div>
  }
}

const mapStateToProps = state => state;

const mapDispatchToProps = dispatch => {
  return {
    actions: bindActionCreators(actions, dispatch)
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(AcceptedCompetitorCard);
